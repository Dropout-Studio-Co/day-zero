<!--
	Compact chat-history list shown as a collapsible strip above the message view when the rail's
	history toggle is open (the message list and composer stay visible below). Switch/rename/delete
	a conversation; deleting preserves action history. Rename/delete use native prompt/confirm.
-->
<script lang="ts">
	import { ai } from "#lib/stores/ai.svelte.js";
	import { deleteConversation, renameConversation, switchConversation } from "#lib/ai/chat-client.js";
	import { Pencil, Trash2 } from "@lucide/svelte";
	import { cn } from "#lib/utils.js";

	const onSwitch = (id: string) => {
		if (id !== ai.activeConversationId) void switchConversation(id);
	};

	const onRename = (id: string, currentTitle: string) => {
		const next = prompt("Rename conversation", currentTitle);
		if (next && next.trim() && next.trim() !== currentTitle) {
			void renameConversation(id, next.trim());
		}
	};

	const onDelete = (id: string) => {
		if (confirm("Delete this conversation? Action history will be preserved.")) {
			void deleteConversation(id);
		}
	};
</script>

<div class="space-y-2">
	{#if ai.conversations.length === 0}
		<p class="text-chat-text-muted py-3 text-center text-xs text-balance">No chats yet.</p>
	{:else}
		<ul class="chat-scrollbar max-h-60 space-y-1 overflow-y-auto pr-1">
			{#each ai.conversations as conversation (conversation.id)}
				{@const active = conversation.id === ai.activeConversationId}
				<li
					class={cn(
						"flex items-center gap-1 rounded-lg border border-solid px-2 py-1.5 transition-colors select-none",
						active
							? "border-chat-border bg-chat-surface-hover"
							: "border-chat-border-subtle bg-chat-surface hover:bg-chat-surface-hover"
					)}
				>
					<button
						type="button"
						onclick={() => onSwitch(conversation.id)}
						class="flex min-w-0 flex-1 touch-manipulation items-center gap-1.5 text-left"
						aria-current={active ? "true" : undefined}
					>
						{#if active}
							<span class="bg-chat-text-primary size-1.5 shrink-0 rounded-full" aria-hidden="true"></span>
						{/if}
						<span
							class={cn(
								"truncate text-xs",
								active ? "text-chat-text-primary font-medium" : "text-chat-text-secondary"
							)}
						>
							{conversation.title}
						</span>
					</button>
					<button
						type="button"
						class="text-chat-text-muted hover:text-chat-text-primary hover:bg-chat-surface-hover touch-manipulation rounded-md p-1 transition-colors"
						onclick={() => onRename(conversation.id, conversation.title)}
						aria-label="Rename chat {conversation.title}"
						title="Rename"
					>
						<Pencil class="size-3" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="text-chat-text-muted hover:bg-destructive/10 hover:text-destructive touch-manipulation rounded-md p-1 transition-colors"
						onclick={() => onDelete(conversation.id)}
						aria-label="Delete chat {conversation.title}"
						title="Delete"
					>
						<Trash2 class="size-3" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
