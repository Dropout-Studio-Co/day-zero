import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "./errors";
import { parseMarkdown, sanitizeAssistantText } from "./markdown";
import { salvageTextToolCalls } from "./salvage";

describe("salvageTextToolCalls", () => {
	it("passes plain prose through untouched", () => {
		expect([salvageTextToolCalls("Nothing to do here."), salvageTextToolCalls("")]).toEqual([
			{ calls: [], cleanedText: "Nothing to do here." },
			{ calls: [], cleanedText: "" }
		]);
	});

	it("recovers a bare tool-call object and strips it from the reply", () => {
		const result = salvageTextToolCalls(
			'Trying that now. {"tool":"createCountdown","args":{"title":"Trip","targetAt":"2026-09-11"}}'
		);
		expect([
			result.calls.length,
			result.calls[0].name,
			result.calls[0].args,
			result.cleanedText
		]).toEqual([
			1,
			"createCountdown",
			{ title: "Trip", targetAt: "2026-09-11" },
			"Trying that now."
		]);
	});

	it("recovers the OpenAI function shape with string arguments", () => {
		const result = salvageTextToolCalls(
			'{"function":{"name":"deleteCountdown","arguments":"{\\"id\\":\\"abc\\"}"}}'
		);
		expect(result.calls[0]).toMatchObject({ name: "deleteCountdown", args: { id: "abc" } });
	});

	it("unwraps a tool_calls array and ignores non-call entries", () => {
		const result = salvageTextToolCalls(
			'{"tool_calls":[{"name":"deleteCountdown","args":{"id":"a"}},{"nope":true},{"name":"deleteCountdown","args":{"id":"b"}}]}'
		);
		expect(result.calls.map((c) => c.args)).toEqual([{ id: "a" }, { id: "b" }]);
	});

	it("leaves malformed JSON alone instead of throwing", () => {
		const text = 'Broken {"tool":"createCountdown",}';
		expect(salvageTextToolCalls(text)).toEqual({ calls: [], cleanedText: text });
	});

	it("keeps braces inside quoted strings from ending the region early", () => {
		expect(
			salvageTextToolCalls('{"tool":"createCountdown","args":{"title":"a}b"}}').calls[0].args
		).toEqual({
			title: "a}b"
		});
	});
});

describe("sanitizeAssistantText", () => {
	it("drops fenced code blocks and collapses runs of spaces", () => {
		expect(sanitizeAssistantText("Here  you   go\n```json\n{}\n```")).toBe("Here you go");
	});

	it("returns empty for a reply that is only a leaked JSON payload", () => {
		expect([
			sanitizeAssistantText('{"tool":"deleteCountdown","args":{"id":"a"}}'),
			sanitizeAssistantText("[]")
		]).toEqual(["", ""]);
	});

	it("strips internal UUIDs but keeps surrounding prose and unicode", () => {
		expect([
			sanitizeAssistantText("Removed 0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d — done."),
			sanitizeAssistantText("Café ☕ ready")
		]).toEqual(["Removed — done.", "Café ☕ ready"]);
	});
});

describe("parseMarkdown", () => {
	it("groups headings, lists, and paragraphs", () => {
		const blocks = parseMarkdown("# Title\n- one\n- two\n\nA paragraph.");
		const list = blocks[1];
		expect([blocks.map((b) => b.type), list.type === "list" && list.items.length]).toEqual([
			["heading", "list", "paragraph"],
			2
		]);
	});
});

describe("friendlyErrorMessage", () => {
	it("maps known technical failures to friendly copy", () => {
		expect([
			friendlyErrorMessage(new Error("Unknown tool: foo")),
			friendlyErrorMessage("Countdown abc not found.")
		]).toEqual([
			"I tried to do something that isn't supported here.",
			"I couldn't find that countdown — it may have been changed or removed. Refresh and try again."
		]);
	});

	it("swallows raw artifacts but passes clean short copy through", () => {
		expect([
			friendlyErrorMessage("TypeError: cannot read x"),
			friendlyErrorMessage("Please try again."),
			friendlyErrorMessage(null)
		]).toEqual([
			"Something went wrong while doing that. Please try again.",
			"Please try again.",
			"Something went wrong while doing that. Please try again."
		]);
	});
});
