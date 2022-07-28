<script setup>
import { ref, computed, provide } from "vue"
import { RouterView } from "vue-router"

import AboutView from "./views/AboutView.vue"
import HomeView from "./views/HomeView.vue"
import NotFoundView from "./views/NotFoundView.vue"
import PlanView from "./views/PlanView.vue"

const routes = {
  "/": HomeView,
  "/about": AboutView,
  "/plan": PlanView,
}
let planData = ["", ""]
const currentPath = ref("/")
provide("currentPath", currentPath)

const currentView = computed(() => {
  const pathValue = currentPath.value.split("?")[0]
  return routes[pathValue] || NotFoundView
})

provide("planData", planData)

function setPlanData(plan, query) {
  planData[0] = plan
  planData[1] = query
}
provide("setPlanData", setPlanData)
window.setPlanData = setPlanData
</script>

<template>
  <!-- <component :is="currentView" /> -->
  <router-view />
</template>
