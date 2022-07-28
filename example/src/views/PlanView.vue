<script lang="ts" setup>
import { inject, ref, onBeforeMount } from "vue"
import Plan from "@/components/Plan.vue"
import MainLayout from "../layouts/MainLayout.vue"
import { Splitpanes, Pane } from "splitpanes"
import { HighlightType, Orientation, ViewMode } from "@/enums"
import type { ViewOptions } from "@/interfaces"
import { useRouter, useRoute } from "vue-router"

const router = useRouter()
const route = useRoute()

const defalutViewOptions = ref<ViewOptions>({
  menuHidden: true,
  showHighlightBar: false,
  showPlanStats: true,
  highlightType: HighlightType.NONE,
  viewMode: ViewMode.FULL,
  orientation: Orientation.TWOD,
  showDiagram: true,
  diagramWidth: 20,
})
function handleDefalutViewOptionsChange(nextOptions: ViewOptions) {
  defalutViewOptions.value = nextOptions
}

// let planData = inject("planData")
// const setPlanData = inject("setPlanData")
// let planData = [];

const planData = ref(inject("planData"))
const loading = ref(true)

onBeforeMount(() => {
  Promise.all([
    route.query.IDA && fetch(`http://10.117.190.170:1323/plan/${route.query.IDA}`).then((data) => data.json()),
    route.query.IDB && fetch(`http://10.117.190.170:1323/plan/${route.query.IDB}`).then((data) => data.json()),
  ])
    .then((data) => {
      // setPlanData(data[0].Content, data[1].Content)
      // console.log(data)
      planData.value = [data[0].Content, data[1].Content]
      loading.value = false
    })
    .catch(() => {
      loading.value = false
    })
})
</script>

<template>
  <main-layout style="display: flex">
   <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" />
    <splitpanes class="plan-view" style="display: flex; min-height: 100%">
      <pane class="d-flex" v-if="planData[0]">
        <plan
          :plan-query="''"
          :plan-source="planData[0]"
          :view-settings-visible="!planData[1]"
          :defalut-view-options="defalutViewOptions"
          @defalut-view-options-change="handleDefalutViewOptionsChange"
        />
      </pane>
      <pane class="d-flex" v-if="planData[1]">
        <plan
          :plan-query="''"
          :plan-source="planData[1]"
          :defalut-view-options="defalutViewOptions"
          :view-settings-visible="true"
          @defalut-view-options-change="handleDefalutViewOptionsChange"
        />
      </pane>
    </splitpanes>
  </main-layout>
</template>

<style lang="scss">
.plan-view.splitpanes--vertical > .splitpanes__splitter {
  min-width: 6px;
  background: linear-gradient(90deg, #ccc, rgb(17, 17, 17));
}
@import "splitpanes/dist/splitpanes.css";
</style>
