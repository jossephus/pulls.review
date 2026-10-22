<script setup lang="ts">
import type { WindowState } from '../ipc'
import DisplayKbd from '@antfu/design/components/Display/DisplayKbd.vue'
import { onMounted, ref, watch, watchEffect } from 'vue'
import Palette from './Palette.vue'

const state = ref<WindowState>({ repo: '', page: '/', label: '', dark: true })
const paletteOpen = ref(false)

onMounted(async () => {
  state.value = await window.yadv.state() ?? state.value
  window.yadv.onState(next => state.value = next)
  window.yadv.onTogglePalette(() => paletteOpen.value = !paletteOpen.value)
})

watchEffect(() => {
  document.documentElement.classList.toggle('dark', state.value.dark)
  document.documentElement.classList.toggle('light', !state.value.dark)
})
watch(paletteOpen, open => window.yadv.setPaletteOpen(open))
</script>

<template>
  <header class="drag-region h-10 flex select-none items-center gap-2 bg-base pl-21 pr-2 text-sm">
    <span class="shrink-0 color-base font-medium">{{ state.repo }}</span>
    <span v-if="state.label" class="shrink-0 op-mute">/</span>
    <span class="truncate op-fade">{{ state.label }}</span>
    <div class="flex-auto" />
    <button
      type="button"
      class="no-drag-region h-7 flex shrink-0 items-center gap-2 border border-base rounded bg-raised px-2 text-xs color-muted transition hover:color-base"
      @click="paletteOpen = true"
    >
      <span class="i-ph:magnifying-glass" aria-hidden="true" />
      Switch
      <DisplayKbd keys="mod+k" />
    </button>
  </header>
  <Palette v-model:open="paletteOpen" />
</template>
