<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import DisplayNumberBadge from '@antfu/design/components/Display/DisplayNumberBadge.vue'

defineProps<{
  pendingCommentCount: number
  /** The review goes to the agent that wrote the diff (`DiffsStoreReviews.audience`). */
  toAgent?: boolean
}>()

defineEmits<{
  review: []
}>()
</script>

<template>
  <div class="relative shrink-0">
    <ActionButton size="sm" variant="action" :icon="toAgent ? 'i-ph:robot-duotone' : 'i-ph:chat-centered-text-duotone'" @click="$emit('review')">
      {{ $t(toAgent ? 'review.sendToAgent' : 'review.addReview') }}
    </ActionButton>
    <DisplayNumberBadge v-if="pendingCommentCount > 0" :value="pendingCommentCount" class="absolute right--2 top--2" />
  </div>
</template>
