<script lang="ts" setup>
import * as _ from "lodash"
import {
  computed,
  reactive,
  ref,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  provide,
  watch,
} from "vue"
import { directive as vTippy } from "vue-tippy"
import { Splitpanes, Pane } from "splitpanes"
import mitt from "mitt"

import type {
  Events,
  IBlocksStats,
  IPlan,
  IPlanContent,
  IPlanStats,
  ITrigger,
  Node,
  Settings,
  ViewOptions,
} from "@/interfaces"
import Copy from "@/components/Copy.vue"
import Diagram from "@/components/Diagram.vue"
import PlanNode from "@/components/PlanNode.vue"
import Stats from "@/components/Stats.vue"
import { scrollChildIntoParentView } from "@/services/help-service"
import { PlanService } from "@/services/plan-service"
import { HelpService } from "@/services/help-service"
import Dragscroll from "@/dragscroll"
import {
  CenterMode,
  HighlightMode,
  HighlightType,
  NodeProp,
  Orientation,
  ViewMode,
} from "@/enums"
import { duration, durationClass, json_, pgsql_ } from "@/filters"

import "tippy.js/dist/tippy.css"

import { library } from "@fortawesome/fontawesome-svg-core"
import { fas } from "@fortawesome/free-solid-svg-icons"
import { far } from "@fortawesome/free-regular-svg-icons"
import { fab } from "@fortawesome/free-brands-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"

// Add all icons to the library
library.add(fas, far, fab)

interface Props {
  planSource: string
  planQuery: string
  viewSettingsVisible: boolean
  defalutViewOptions: ViewOptions
}
const props = defineProps<Props>()
const emit = defineEmits(["defalutViewOptionsChange"])

const version = __APP_VERSION__ // eslint-disable-line no-undef

const rootEl = ref(null) // The root Element of this instance
const activeTab = ref<string>("")
const queryText = ref<string>("")
const validationMessage = ref<string>("")
const plan = ref<IPlan>()
const planEl = ref()
let planStats = reactive<IPlanStats>({} as IPlanStats)
const rootNode = ref<Node>()
const zoomTo = ref<number>()
const showSettings = ref<boolean>(false)
const showTriggers = ref<boolean>(false)
const selectedNode = ref<number>(NaN)
const highlightedNode = ref<number>(NaN)
const planNodes: { [key: number]: typeof PlanNode } = {}

const emitter = mitt<Events>()

const viewOptions = reactive<ViewOptions>({
  menuHidden: true,
  showHighlightBar: false,
  showPlanStats: true,
  highlightType: HighlightType.NONE,
  viewMode: ViewMode.FULL,
  orientation: Orientation.TWOD,
  showDiagram: true,
  diagramWidth: 20,
})

const planService = new PlanService()

const helpService = new HelpService()
const getHelpMessage = helpService.getHelpMessage

onBeforeMount(() => {
  const savedOptions = localStorage.getItem("viewOptions")
  if (savedOptions) {
    _.assignIn(viewOptions, JSON.parse(savedOptions))
  }
  let planJson: IPlanContent
  try {
    planJson = planService.fromSource(props.planSource) as IPlanContent
    validationMessage.value = ""
    setActiveTab("plan")
  } catch (e) {
    validationMessage.value = "Couldn't parse plan"
    plan.value = undefined
    return
  }
  rootNode.value = planJson.Plan
  queryText.value = planJson["Query Text"] || props.planQuery
  plan.value = planService.createPlan("", planJson, queryText.value)
  const content = plan.value.content
  planStats.executionTime =
    (content["Execution Time"] as number) ||
    (content["Total Runtime"] as number) ||
    NaN
  planStats.planningTime = (content["Planning Time"] as number) || NaN
  planStats.maxRows = content.maxRows || NaN
  planStats.maxCost = content.maxCost || NaN
  planStats.maxDuration = content.maxDuration || NaN
  planStats.maxBlocks = content.maxBlocks || ({} as IBlocksStats)
  planStats.triggers = content.Triggers || []
  planStats.jitTime =
    (content.JIT && content.JIT.Timing && content.JIT.Timing.Total) || NaN
  planStats.settings = content.Settings as Settings
  plan.value.planStats = planStats

  nextTick(() => {
    let nodeId = 1
    let highlightMode = HighlightMode.flash
    if (zoomTo.value) {
      nodeId = zoomTo.value
      // tslint:disable-next-line:no-bitwise
      highlightMode = HighlightMode.highlight | HighlightMode.showdetails
    }
    centerNode(nodeId, CenterMode.visible, highlightMode)
    // build the diagram structure
    // with level and reference to PlanNode components for interaction
    if (!plan.value) {
      return
    }
    onHashChange()
  })
  window.addEventListener("hashchange", onHashChange)
})

onMounted(() => {
  handleScroll()
  emitter.on("clickcte", onClickCte)
})

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", onHashChange)
})

watch(viewOptions, onViewOptionsChanged)

watch(
  () => props.defalutViewOptions,
  () => {
    if (!props.viewSettingsVisible) {
      Object.assign(viewOptions, props.defalutViewOptions)
    }
  },
  { deep: true }
)

function onViewOptionsChanged() {
  if (!props.viewSettingsVisible) {
    return
  }
  emit("defalutViewOptionsChange", viewOptions)
  localStorage.setItem("viewOptions", JSON.stringify(viewOptions))
}

function onHashChange(): void {
  const reg = /#([a-zA-Z]*)(\/node\/([0-9]*))*/
  const matches = reg.exec(window.location.hash)
  if (matches) {
    const tab = matches[1] || "plan"
    setActiveTab(tab)
    const nodeId = matches[3]
    if (nodeId !== undefined) {
      // Delayed to make sure the tab has changed before recentering
      setTimeout(() => {
        selectNode(parseInt(nodeId, 0))
      }, 1)
    }
  }
}

// Register a PlanNode component by its id
function registerNode(node: typeof PlanNode) {
  planNodes[node.props.node.nodeId] = node
}

provide("register", registerNode)
provide("selectedNode", selectedNode)
provide("highlightedNode", highlightedNode)
provide("emitter", emitter)

function selectNode(nodeId: number) {
  selectedNode.value = nodeId
  centerNode(nodeId, CenterMode.visible, HighlightMode.highlight)
}

function centerNode(
  nodeId: number,
  centerMode: CenterMode,
  highlightMode: HighlightMode
): void {
  const cmp = planNodes[nodeId]
  if (cmp) {
    highlightEl(cmp.refs.el, centerMode, highlightMode)
    // tslint:disable-next-line:no-bitwise
    if (highlightMode & HighlightMode.showdetails) {
      cmp.setShowDetails(true)
    }
  }
}

function highlightEl(
  el: Element | HTMLElement | null,
  centerMode: CenterMode,
  highlightMode: HighlightMode
) {
  if (!el) {
    return
  }
  const parent = planEl.value.$el
  if (centerMode !== CenterMode.none) {
    scrollChildIntoParentView(
      parent,
      el,
      centerMode === CenterMode.center,
      () => {
        // tslint:disable-next-line:no-bitwise
        if (highlightMode & HighlightMode.flash) {
          el.classList.add("flash")
          setTimeout(() => {
            el.classList.remove("flash")
          }, 1000)
        }
        /*
        // tslint:disable-next-line:no-bitwise
        if (highlightMode & HighlightMode.highlight) {
          el.classList.add("highlight")
        }
        */
      }
    )
  }
}

const setActiveTab = (tab: string) => {
  activeTab.value = tab
}

const planningTimeClass = (percent: number) => {
  let c
  if (percent > 90) {
    c = 4
  } else if (percent > 40) {
    c = 3
  } else if (percent > 10) {
    c = 2
  }
  if (c) {
    return "c-" + c
  }
  return false
}

const totalTriggerDurationPercent = computed(() => {
  const executionTime = planStats.executionTime || 0
  const totalDuration = triggersTotalDuration.value || 0
  return _.round((totalDuration / executionTime) * 100)
})

function triggerDurationPercent(trigger: ITrigger) {
  const executionTime = planStats.executionTime || 0
  const time = trigger.Time
  return _.round((time / executionTime) * 100)
}

const triggersTotalDuration = computed(() => {
  return _.sumBy(planStats.triggers, (o) => o.Time)
})

function handleScroll(): void {
  if (!planEl.value) {
    return
  }
  const el: Element = planEl.value.$el as Element
  new Dragscroll(el)
}

function onClickCte(subplanName: string): void {
  const cmp = _.find(planNodes, (o) => {
    return (
      o.props.node[NodeProp.SUBPLAN_NAME] &&
      o.props.node[NodeProp.SUBPLAN_NAME] == subplanName
    )
  })
  cmp && highlightEl(cmp.refs.outerEl, CenterMode.visible, HighlightMode.flash)
}
</script>

<template>
  <div
    class="plan-container d-flex flex-column overflow-hidden flex-grow-1 bg-light"
    ref="rootEl"
  >
    <div class="d-flex align-items-center">
      <ul class="nav nav-pills">
        <li class="nav-item p-1">
          <a
            class="nav-link px-2 py-0"
            :class="{ active: activeTab === 'plan' }"
            href="#plan"
            >Plan</a
          >
        </li>
        <li class="nav-item p-1">
          <a
            class="nav-link px-2 py-0"
            :class="{ active: activeTab === 'raw' }"
            href="#raw"
            >Raw</a
          >
        </li>
        <li class="nav-item p-1">
          <a
            class="nav-link px-2 py-0"
            :class="{ active: activeTab === 'query', disabled: !queryText }"
            href="#query"
            >Query</a
          >
        </li>
        <li class="nav-item p-1">
          <a
            class="nav-link px-2 py-0"
            :class="{ active: activeTab === 'stats' }"
            href="#stats"
            >Stats</a
          >
        </li>
      </ul>
    </div>
    <div class="tab-content flex-grow-1 d-flex overflow-hidden">
      <div
        v-if="validationMessage"
        class="flex-grow-1 d-flex justify-content-center"
      >
        <div class="alert alert-danger align-self-center">
          {{ validationMessage }}
        </div>
      </div>
      <div
        class="tab-pane flex-grow-1 overflow-hidden"
        :class="{ 'show active d-flex': activeTab === 'plan' }"
        v-if="!validationMessage"
      >
        <!-- Plan tab -->
        <div
          class="d-flex flex-column flex-grow-1 overflow-hidden"
          :class="[viewOptions.viewMode, viewOptions.orientation]"
        >
          <div
            class="plan-stats flex-shrink-0 d-flex border-bottom border-top form-inline"
            v-if="plan"
          >
            <div class="d-inline-block px-2">
              Execution time:
              <template v-if="!planStats.executionTime">
                <span class="text-muted">
                  N/A
                  <font-awesome-icon
                    icon="info-circle"
                    class="cursor-help"
                    v-tippy="getHelpMessage('missing execution time')"
                  ></font-awesome-icon>
                </span>
              </template>
              <template v-else>
                <span
                  class="stat-value"
                  v-html="duration(planStats.executionTime)"
                ></span>
              </template>
            </div>
            <div class="d-inline-block border-left px-2">
              Planning time:
              <template v-if="!planStats.planningTime">
                <span class="text-muted">
                  N/A
                  <font-awesome-icon
                    icon="info-circle"
                    class="cursor-help"
                    v-tippy="getHelpMessage('missing planning time')"
                  ></font-awesome-icon>
                </span>
              </template>
              <template v-else>
                <span class="stat-value">
                  <span
                    :class="
                      'mb-0 p-0 px-1 alert ' +
                      planningTimeClass(
                        (planStats.planningTime / (planStats.executionTime as number)) *
                         100
                      )
                    "
                    v-html="duration(planStats.planningTime)"
                  ></span>
                </span>
              </template>
            </div>
            <div
              class="d-inline-block border-left px-2"
              v-if="planStats.jitTime && planStats.executionTime"
            >
              JIT:
              <span class="stat-value">
                <span
                  :class="
                    'mb-0 p-0 px-1 alert ' +
                    planningTimeClass(
                      (planStats.jitTime / planStats.executionTime) * 100
                    )
                  "
                  v-html="duration(planStats.jitTime)"
                ></span>
              </span>
            </div>
            <div class="d-inline-block border-left px-2 position-relative">
              <span class="stat-label">Triggers: </span>
              <template v-if="planStats.triggers && planStats.triggers.length">
                <span class="stat-value">
                  <span
                    :class="
                      'mb-0 p-0 px-1 alert ' +
                      durationClass(totalTriggerDurationPercent)
                    "
                    v-html="duration(triggersTotalDuration)"
                  ></span>
                </span>
                <button
                  @click.prevent="showTriggers = !showTriggers"
                  class="bg-transparent border-0 p-0 m-0 pl-1"
                >
                  <font-awesome-icon
                    icon="caret-down"
                    class="text-muted"
                  ></font-awesome-icon>
                </button>
                <div
                  class="stat-dropdown-container text-left"
                  v-if="showTriggers"
                >
                  <button
                    class="btn btn-close float-right"
                    v-on:click="showTriggers = false"
                  >
                    <font-awesome-icon icon="times"></font-awesome-icon>
                  </button>
                  <h3>Triggers</h3>
                  <div
                    v-for="(trigger, index) in planStats.triggers"
                    :key="index"
                  >
                    {{ trigger["Trigger Name"] }}
                    <br />
                    <span class="text-muted">Called</span> {{ trigger["Calls"]
                    }}<span class="text-muted">&times;</span>
                    <span class="float-right">
                      <span
                        :class="
                          'p-0 px-1 alert ' +
                          durationClass(triggerDurationPercent(trigger))
                        "
                        v-html="duration(trigger.Time)"
                      ></span>
                      | {{ triggerDurationPercent(trigger)
                      }}<span class="text-muted">%</span>
                    </span>
                    <br />
                    <span class="text-muted" v-if="trigger.Relation">on</span>
                    {{ trigger.Relation }}
                    <div class="clearfix"></div>
                    <hr
                      v-if="
                        planStats.triggers &&
                        index != planStats.triggers.length - 1
                      "
                      class="my-2"
                    />
                  </div>
                </div>
              </template>
              <span v-else class="text-muted"> N/A </span>
            </div>
            <div
              class="d-inline-block border-left px-2 position-relative"
              v-if="planStats.settings"
            >
              <span class="stat-label"
                >Settings:
                <span class="badge badge-secondary">{{
                  _.keys(planStats.settings).length
                }}</span></span
              >
              <button
                @click.prevent="showSettings = !showSettings"
                class="bg-transparent border-0 p-0 m-0 pl-1"
              >
                <font-awesome-icon
                  icon="caret-down"
                  class="text-muted"
                ></font-awesome-icon>
              </button>
              <div
                class="stat-dropdown-container text-left"
                v-if="showSettings"
              >
                <button
                  class="btn btn-close float-right"
                  v-on:click="showSettings = false"
                >
                  <font-awesome-icon icon="times"></font-awesome-icon>
                </button>
                <h3>PG Settings</h3>
                <em class="text-muted d-block pb-2">
                  Configuration parameters affecting query planning with value
                  different from the built-in default value.
                </em>
                <table class="table table-sm table-striped mb-0">
                  <tbody>
                    <tr v-for="(value, key) in planStats.settings" :key="key">
                      <td>{{ key }}</td>
                      <td>{{ value }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <button
              v-if="viewSettingsVisible"
              v-on:click="viewOptions.menuHidden = !viewOptions.menuHidden"
              :class="[
                'border-left btn btn-sm p-0 px-2 ml-auto',
                { 'text-primary': !viewOptions.menuHidden },
              ]"
            >
              <font-awesome-icon icon="cog" class="p-0"></font-awesome-icon>
              Settings
            </button>
          </div>
          <div class="flex-grow-1 d-flex overflow-hidden">
            <div class="flex-grow-1 overflow-hidden">
              <splitpanes
                class="default-theme"
                @resize="viewOptions.diagramWidth = $event[0].size"
              >
                <pane
                  :size="viewOptions.diagramWidth"
                  class="d-flex"
                  v-if="viewOptions.showDiagram && plan"
                >
                  <diagram
                    ref="diagram"
                    :plan="plan"
                    class="d-flex flex-column flex-grow-1 overflow-hidden plan-diagram"
                  >
                  </diagram>
                </pane>
                <pane
                  ref="planEl"
                  class="plan d-flex flex-column flex-grow-1 grab-bing overflow-auto"
                >
                  <ul class="main-plan p-2 mb-0">
                    <li>
                      <plan-node
                        :node="rootNode"
                        :plan="plan"
                        :viewOptions="viewOptions"
                        v-if="plan && rootNode"
                        ref="root"
                      >
                      </plan-node>
                    </li>
                  </ul>
                  <ul
                    class="init-plans p-2 mb-0"
                    v-if="plan && plan.ctes && plan.ctes.length"
                  >
                    <li v-for="node in plan.ctes" :key="node.nodeId">
                      <plan-node
                        :node="node"
                        :plan="plan"
                        :viewOptions="viewOptions"
                        ref="root"
                      >
                      </plan-node>
                    </li>
                  </ul>
                </pane>
              </splitpanes>
            </div>
            <div
              class="small p-2 border-left"
              v-if="plan && viewSettingsVisible && !viewOptions.menuHidden"
            >
              <div class="text-right clearfix">
                <button
                  type="button"
                  class="close"
                  aria-label="Close"
                  @click="viewOptions.menuHidden = true"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="form-check">
                <input
                  id="showDiagram"
                  type="checkbox"
                  v-model="viewOptions.showDiagram"
                  class="form-check-input"
                />
                <label for="showDiagram" class="form-check-label"
                  ><font-awesome-icon icon="align-left"></font-awesome-icon>
                  Diagram</label
                >
              </div>
              <hr />
              <label class="text-uppercase">Density</label>
              <div class="form-group">
                <div class="btn-group btn-group-sm">
                  <button
                    class="btn btn-outline-secondary"
                    :class="{ active: viewOptions.viewMode == ViewMode.FULL }"
                    v-on:click="viewOptions.viewMode = ViewMode.FULL"
                  >
                    full
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.viewMode == ViewMode.COMPACT,
                    }"
                    v-on:click="viewOptions.viewMode = ViewMode.COMPACT"
                  >
                    compact
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{ active: viewOptions.viewMode == ViewMode.DOT }"
                    v-on:click="viewOptions.viewMode = ViewMode.DOT"
                  >
                    dot
                  </button>
                </div>
              </div>
              <hr />
              <label class="text-uppercase">Orientation</label>
              <div class="form-group">
                <div class="btn-group btn-group-sm">
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.orientation == Orientation.TWOD,
                    }"
                    v-on:click="viewOptions.orientation = Orientation.TWOD"
                  >
                    <font-awesome-icon icon="sitemap"></font-awesome-icon>
                    2D
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.orientation == Orientation.CLASSIC,
                    }"
                    v-on:click="viewOptions.orientation = Orientation.CLASSIC"
                  >
                    <font-awesome-icon icon="list"></font-awesome-icon>
                    classic
                  </button>
                </div>
              </div>
              <hr />
              <label class="text-uppercase">Graph metric</label>
              <div class="form-group">
                <div class="btn-group btn-group-sm">
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.highlightType === HighlightType.NONE,
                    }"
                    v-on:click="viewOptions.highlightType = HighlightType.NONE"
                  >
                    none
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active:
                        viewOptions.highlightType === HighlightType.DURATION,
                    }"
                    v-on:click="
                      viewOptions.highlightType = HighlightType.DURATION
                    "
                    :disabled="!plan.isAnalyze"
                  >
                    duration
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.highlightType === HighlightType.ROWS,
                    }"
                    v-on:click="viewOptions.highlightType = HighlightType.ROWS"
                    :disabled="
                      !rootNode || rootNode[NodeProp.ACTUAL_ROWS] === undefined
                    "
                  >
                    rows
                  </button>
                  <button
                    class="btn btn-outline-secondary"
                    :class="{
                      active: viewOptions.highlightType === HighlightType.COST,
                    }"
                    v-on:click="viewOptions.highlightType = HighlightType.COST"
                  >
                    cost
                  </button>
                </div>
              </div>
            </div>
          </div>
          <!-- end Plan tab -->
        </div>
      </div>
      <div
        class="tab-pane flex-grow-1 overflow-hidden position-relative"
        :class="{ 'show active': activeTab === 'raw' }"
      >
        <div class="overflow-hidden d-flex w-100 h-100">
          <div class="overflow-auto flex-grow-1">
            <pre
              class="small p-2 mb-0"
            ><code class="hljs" v-html="json_(planSource)"></code></pre>
          </div>
          <copy :content="planSource" />
        </div>
      </div>
      <div
        class="tab-pane flex-grow-1 overflow-hidden position-relative"
        :class="{ 'show active': activeTab === 'query' }"
        v-if="queryText"
      >
        <div class="overflow-hidden d-flex w-100 h-100">
          <div class="overflow-auto flex-grow-1">
            <pre
              class="small p-2 mb-0"
            ><code class="hljs" v-html="pgsql_(queryText)"></code></pre>
          </div>
        </div>
        <copy :content="queryText" />
      </div>
      <div
        class="tab-pane flex-grow-1 overflow-auto"
        :class="{ 'show active': activeTab === 'stats' }"
      >
        <stats :plan="plan" v-if="plan"></stats>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@import "../assets/scss/variables";
@import "../assets/scss/pev2";
@import "splitpanes/dist/splitpanes.css";
@import "highlight.js/scss/stackoverflow-light.scss";
</style>
