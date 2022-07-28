import { createApp } from "vue"
import "bootstrap"
import "bootstrap/dist/css/bootstrap.css"
// import Popper from "vue3-popper"
import { createWebHashHistory, createRouter } from "vue-router"
import AboutView from "./views/AboutView.vue"
import HomeView from "./views/HomeView.vue"
import NotFoundView from "./views/NotFoundView.vue"
import PlanView from "./views/PlanView.vue"

import App from "./App.vue"

const routes = [
  { path: "/", component: HomeView },
  { path: "/about", component: AboutView },
  { path: "/plan/node/*", component: PlanView },
  { path: "/plan", component: PlanView },
]

const router = createRouter({
  // 4. Provide the history implementation to use. We are using the hash history for simplicity here.
  history: createWebHashHistory(),
  routes, // short for `routes: routes`
})

const app = createApp(App)

app.use(router)

app.mount("#app")

// app.component("Popper", Popper)

declare global {
  interface Window {
    setPlanData: () => void
  }
}
