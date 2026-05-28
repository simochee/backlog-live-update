/**
 * live polling が動いている tab にだけ action icon の badge を出す。
 *
 * content script が `pollWhileVisible` 起動直後と pagehide 時に `live-state`
 * message を送ってくる。送信元 tab id を `browser.action.setBadgeText` の
 * `tabId` に渡し tab スコープで badge を切り替える(tab を閉じれば browser
 * 側で自動 GC される)。
 */

import { debugLog } from "@/utils/debug-log";

// 空白文字を渡すと badge は表示されるが text は見えない(空文字だと badge 自体が消える)。
// icon の #4caf93 (teal-green) に対し HSL 180°回転寄り(やや赤寄せ)の rose-red を当てる。
const BADGE_TEXT = " ";
const BADGE_BACKGROUND_COLOR = "#c25462";

interface LiveStateMessage {
	type: "live-state";
	active: boolean;
}

function isLiveStateMessage(value: unknown): value is LiveStateMessage {
	if (value === null || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return record.type === "live-state" && typeof record.active === "boolean";
}

export default defineBackground(() => {
	// MV3(chrome)は `browser.action`、MV2(firefox)は `browser.browserAction`。
	const action = browser.action ?? browser.browserAction;
	debugLog("background boot", { hasAction: action != null });
	if (action == null) return;

	browser.runtime.onMessage.addListener((message, sender) => {
		const tabId = sender.tab?.id;
		debugLog("background onMessage", { tabId, message });
		if (tabId == null) return;
		if (!isLiveStateMessage(message)) return;

		if (message.active) {
			void action
				.setBadgeBackgroundColor({
					tabId,
					color: BADGE_BACKGROUND_COLOR,
				})
				.catch((err) => debugLog("setBadgeBackgroundColor failed", err));
			void action
				.setBadgeText({ tabId, text: BADGE_TEXT })
				.catch((err) => debugLog("setBadgeText failed", err));
		} else {
			void action
				.setBadgeText({ tabId, text: "" })
				.catch((err) => debugLog("setBadgeText off failed", err));
		}
	});
});
