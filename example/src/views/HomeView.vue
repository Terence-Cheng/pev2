<script lang="ts" setup>
import { inject, ref, onMounted } from "vue"
import MainLayout from "../layouts/MainLayout.vue"
import { useRouter, useRoute } from "vue-router"

const router = useRouter()

const setPlanData = inject("setPlanData")

const planInput = ref<string>("")
const queryInput = ref<string>("")
const draggingPlan = ref<boolean>(false)
const draggingQuery = ref<boolean>(false)
const urlBase = "http://10.117.190.170:1323"

interface Sample extends Array<string> {
  0: string
  1: string
  2: string
}

async function fetchData(url = "", method = "GET", data = []) {
  const response = await fetch(url, {
    method: method,
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
    },
  })
  return response.json()
}

function submitPlan() {
  try {
    const testData = {
      planA: planInput.value,
      planB: queryInput.value,
    }
    fetchData(`${urlBase}/submit`, "POST", testData)
    .then((data) => {
      console.log(data)
      setPlanData(planInput.value, queryInput.value)
      router.push({ path: "/plan", query: { IDA: data.IDA, IDB: data.IDB || undefined } })
    })
    .catch(error => {
        setPlanData(planInput.value, queryInput.value)
        router.push("/plan")
    })
  } catch (error) {
    setPlanData(planInput.value, queryInput.value)
    router.push("/plan")
    throw new Error(error)
  }
}

onMounted(() => {
  const textAreas = document.getElementsByTagName("textarea")
  Array.prototype.forEach.call(textAreas, (elem: HTMLInputElement) => {
    elem.placeholder = elem.placeholder.replace(/\\n/g, "\n")
  })
  const noHashURL = window.location.href.replace(/#.*$/, "")
  window.history.replaceState("", document.title, noHashURL)
})

function handleDrop(event: DragEvent) {
  const input = event.srcElement
  if (!(input instanceof HTMLTextAreaElement)) {
    return
  }
  draggingPlan.value = false
  draggingQuery.value = false
  if (!event.dataTransfer) {
    return
  }
  const file = event.dataTransfer.files[0]
  const reader = new FileReader()
  reader.onload = () => {
    if (reader.result instanceof ArrayBuffer) {
      return
    }
    input.value = reader.result || ""
    input.dispatchEvent(new Event("input"))
  }
  reader.readAsText(file)
}
</script>

<template>
  <main-layout>
    <div class="container">
      <form v-on:submit.prevent="submitPlan">
        <div class="form-group">
          <label for="planInput">
            Plan #1 <span class="small text-muted">(text or JSON)</span>
          </label>
          <textarea
            :class="['form-control', draggingPlan ? 'dropzone-over' : '']"
            id="planInput"
            rows="8"
            v-model="planInput"
            @dragenter="draggingPlan = true"
            @dragleave="draggingPlan = false"
            @drop.prevent="handleDrop"
            placeholder="Paste execution plan\nOr drop a file"
          >
          </textarea>
        </div>
        <div class="form-group">
          <label for="queryInput">
            Plan #2
            <span class="small text-muted">(text or JSON, optional)</span>
          </label>
          <textarea
            :class="['form-control', draggingQuery ? 'dropzone-over' : '']"
            id="queryInput"
            rows="8"
            v-model="queryInput"
            @dragenter="draggingQuery = true"
            @dragleave="draggingQuery = false"
            @drop.prevent="handleDrop"
            placeholder="Paste execution plan\nOr drop a file"
          >
          </textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    </div>
  </main-layout>
</template>
