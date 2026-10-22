<script setup lang="ts">
import type { ReviewVerdict } from '@pulls.review/core/types'
import type { DiffsStoreReviews } from '../../stores/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import FormTextarea from '@antfu/design/components/Form/FormTextarea.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppModal from '../AppModal.vue'

const props = defineProps<{
  open: boolean
  reviews: DiffsStoreReviews
  authorLogin?: string
  document?: Document | ShadowRoot
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const body = ref('')
const verdict = ref<ReviewVerdict>('COMMENT')
const busy = ref(false)
const error = ref<string>()

const { t } = useI18n()
// The comments go to the agent that wrote the diff: no verdict, nothing posted.
const toAgent = computed(() => props.reviews.audience === 'agent')
const isOwnPr = computed(() => !!props.authorLogin && !!props.reviews.viewerLogin
  && props.authorLogin.toLowerCase() === props.reviews.viewerLogin.toLowerCase())
watch(isOwnPr, (own) => {
  if (own)
    verdict.value = 'COMMENT'
})
const verdictOptions = computed(() => [
  { value: 'COMMENT', label: t('review.comment'), icon: 'i-octicon-comment-16' },
  { value: 'APPROVE', label: t('review.approve'), icon: 'i-octicon-check-circle-16', disabled: isOwnPr.value },
  { value: 'REQUEST_CHANGES', label: t('review.requestChanges'), icon: 'i-octicon-code-review-16', disabled: isOwnPr.value },
])

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = undefined
  try {
    await action()
    body.value = ''
    verdict.value = 'COMMENT'
    emit('update:open', false)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    :title="$t(toAgent ? 'review.sendToAgent' : 'review.reviewChanges')"
    :open="open"
    :document="document"
    @update:open="emit('update:open', $event)"
  >
    <div class="w-full flex flex-col gap-3 p-3">
      <p v-if="reviews.pendingCommentCount > 0" class="text-sm op-fade">
        {{ $t('review.includesPending', { n: reviews.pendingCommentCount }, reviews.pendingCommentCount) }}
      </p>
      <FormTextarea
        v-model="body"
        :rows="4"
        :placeholder="$t(toAgent ? 'review.agentSummaryPlaceholder' : 'review.summaryPlaceholder')"
        :disabled="busy"
        :invalid="!!error"
      />

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">
        {{ error }}
      </p>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <ActionToggleGroup
          v-if="!toAgent"
          :model-value="verdict"
          :options="verdictOptions"
          @update:model-value="value => { if (value) verdict = value as ReviewVerdict }"
        />
        <div class="flex-auto" />
        <ActionButton
          v-if="reviews.pendingReview && (!toAgent || reviews.pendingCommentCount > 0)"
          variant="text"
          class="text-red-600 dark:text-red-400"
          :disabled="busy"
          @click="run(() => props.reviews.discardPendingReview())"
        >
          {{ $t('review.discard') }}
        </ActionButton>
        <div class="flex-auto" />
        <ActionButton
          variant="primary"
          class="px3"
          :loading="busy"
          :disabled="verdict !== 'APPROVE' && !body.trim() && reviews.pendingCommentCount === 0"
          @click="run(() => props.reviews.submitReview(verdict, body))"
        >
          {{ $t(toAgent ? 'review.copyForAgent' : 'common.submit') }}
        </ActionButton>
      </div>
      <p v-if="toAgent" class="text-xs color-muted">
        {{ $t('review.agentHint') }}
      </p>
      <p v-else-if="isOwnPr" class="text-xs color-muted">
        {{ $t('review.ownPrCommentOnly') }}
      </p>
    </div>
  </AppModal>
</template>
