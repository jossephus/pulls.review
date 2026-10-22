<script setup lang="ts">
import type { PaletteData } from '../ipc'
import DisplayKbd from '@antfu/design/components/Display/DisplayKbd.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'
import { Fzf } from 'fzf'
import { computed, nextTick, ref, watch } from 'vue'

/** One palette row: a review target in this repository, or a workspace to switch to. */
interface Row {
  key: string
  group: string
  icon: string
  title: string
  detail?: string
  changes?: number
  current?: boolean
  run: () => void
}

const open = defineModel<boolean>('open', { required: true })

const data = ref<PaletteData>()
const query = ref('')
const active = ref(0)
const list = ref<HTMLElement>()

watch(open, async (value) => {
  if (!value)
    return
  query.value = ''
  active.value = 0
  data.value = await window.yadv.palette()
})

const rows = computed<Row[]>(() => {
  if (!data.value)
    return []
  const close = (): void => {
    open.value = false
  }
  return [
    ...data.value.pages.map(page => ({
      key: `page:${page.page}`,
      group: 'This repository',
      icon: page.icon,
      title: page.title,
      run: () => {
        window.yadv.openPage(page.page)
        close()
      },
    })),
    ...data.value.groups.flatMap(group => group.workspaces.map(workspace => ({
      key: `${group.id}:${workspace.path}`,
      group: group.title,
      icon: group.icon,
      title: workspace.name,
      detail: [workspace.head, workspace.location].filter(Boolean).join('  ·  '),
      changes: workspace.changes,
      current: workspace.current,
      run: () => {
        if (!workspace.current)
          window.yadv.openWorkspace(workspace.path)
        close()
      },
    }))),
  ]
})

const results = computed(() => {
  if (!query.value)
    return rows.value
  return new Fzf(rows.value, { selector: row => `${row.title} ${row.detail ?? ''} ${row.group}` })
    .find(query.value)
    .map(entry => entry.item)
})

/** Rows under their group headings, each keeping its index in `results` for the keyboard. */
const sections = computed(() => {
  const groups = new Map<string, { row: Row, index: number }[]>()
  results.value.forEach((row, index) => {
    groups.set(row.group, [...groups.get(row.group) ?? [], { row, index }])
  })
  return [...groups]
})

watch(query, () => active.value = 0)
watch(active, async (index) => {
  await nextTick()
  list.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onKeydown(event: KeyboardEvent): void {
  const count = results.value.length
  if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n'))
    active.value = (active.value + 1) % Math.max(count, 1)
  else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p'))
    active.value = (active.value - 1 + count) % Math.max(count, 1)
  else if (event.key === 'Enter')
    results.value[active.value]?.run()
  else
    return
  event.preventDefault()
}
</script>

<template>
  <OverlayModal v-model:open="open">
    <div class="flex flex-col gap-2" @keydown="onKeydown">
      <FormSearchField v-model="query" placeholder="Switch to a worktree, a rift, or a review…" class="w-full" />
      <div ref="list" class="max-h-[min(60vh,28rem)] overflow-y-auto">
        <p v-if="!data" class="px-2 py-6 text-center text-sm op-fade">
          Looking for workspaces…
        </p>
        <p v-else-if="!results.length" class="px-2 py-6 text-center text-sm op-fade">
          Nothing matches “{{ query }}”.
        </p>
        <section v-for="[group, entries] in sections" :key="group" class="pt-2">
          <h2 class="px-2 pb-1 text-xs color-muted font-medium">
            {{ group }}
          </h2>
          <button
            v-for="{ row, index } in entries"
            :key="row.key"
            type="button"
            :data-index="index"
            class="w-full flex items-center gap-2.5 rounded px-2 py-1.5 text-left"
            :class="index === active ? 'bg-active' : ''"
            @mousemove="active = index"
            @click="row.run()"
          >
            <span :class="row.icon" class="shrink-0 op-fade" aria-hidden="true" />
            <span class="min-w-0 flex-auto">
              <span class="block truncate text-sm color-base">{{ row.title }}</span>
              <span v-if="row.detail" class="block truncate text-xs font-mono op-fade">{{ row.detail }}</span>
            </span>
            <span v-if="row.changes" class="shrink-0 text-xs color-muted">{{ row.changes }} changed</span>
            <span v-if="row.current" class="shrink-0 text-xs color-primary">current</span>
          </button>
        </section>
      </div>
      <footer class="flex gap-4 border-t border-base px-2 pt-2 text-xs color-muted">
        <span class="flex items-center gap-1"><DisplayKbd keys="up" /><DisplayKbd keys="down" /> move</span>
        <span class="flex items-center gap-1"><DisplayKbd keys="enter" /> open</span>
        <span class="flex items-center gap-1"><DisplayKbd keys="escape" /> close</span>
      </footer>
    </div>
  </OverlayModal>
</template>
