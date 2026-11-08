/**
 * live polling が動いている tab にだけ action icon の badge を出す。
 *
 * content script が `pollWhileVisible` 起動直後と pagehide 時に `live-state`
 * message を送ってくる。送信元 tab id を `browser.action.setBadgeText` の
 * `tabId` に渡し tab スコープで badge を切り替える(tab を閉じれば browser
 * 側で自動 GC される)。
 */

import { debugLog } from "@/utils/debug-log";
import { isLiveStateMessage } from "@/utils/live-state-message";

// 空白文字 + 赤背景。空文字だと badge 自体が描画されないため text は " " 固定。
const BADGE_TEXT = " ";
const BADGE_BACKGROUND_COLOR = "#f42858";

export default defineBackground(() => {
	const action = browser.action;
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
