import { type createClient, getProjectActivities } from "backlog-js";

// public API の count 上限。窓より古い push は判断できない。
export const PUSH_ACTIVITY_COUNT = 100;
// Git push のアクティビティ種別。
const GIT_PUSH_ACTIVITY_TYPE = 12;
// pushedAt が進んでからアクティビティに現れるまでの遅延を待つ tick 数の上限。
export const MAX_ACTIVITY_LAG_TICKS = 3;

export interface PushTarget {
	pushedAt: string | null;
	repositoryId: number;
	branch: string;
	base: string;
}

interface PushActivity {
	created: string;
	content?: {
		repository?: { id?: number } | null;
		ref?: string | null;
	} | null;
}

function time(value: string): number {
	return Date.parse(value);
}

// pushedAt の進行だけを毎 tick の判断に使い、アクティビティは進んだときに 1 回だけ取る。
export function createPushDetector(
	backlog: ReturnType<typeof createClient>,
	projectKey: string,
): (target: PushTarget) => Promise<boolean> {
	let baseline: string | undefined;
	let lagTicks = 0;

	const settle = (pushedAt: string) => {
		baseline = pushedAt;
		lagTicks = 0;
	};

	return async ({ pushedAt, repositoryId, branch, base }) => {
		if (pushedAt === null) return false;
		if (baseline === undefined) {
			settle(pushedAt);
			return false;
		}
		if (time(pushedAt) <= time(baseline)) return false;

		let activities: readonly PushActivity[];
		try {
			activities = (await getProjectActivities(
				backlog,
				encodeURIComponent(projectKey),
				{
					activityTypeId: [GIT_PUSH_ACTIVITY_TYPE],
					count: PUSH_ACTIVITY_COUNT,
				},
			)) as readonly PushActivity[];
		} catch {
			return false;
		}

		const since = time(baseline);
		const oldest = activities.at(-1);
		// 窓の最古がまだ基準値より新しいと、窓の外に未確認の push があり得る。
		// 内部 API の無駄打ちより、見逃して履歴が古いままになる方が害が大きいので取り直す。
		if (
			activities.length >= PUSH_ACTIVITY_COUNT &&
			oldest &&
			time(oldest.created) > since
		) {
			settle(pushedAt);
			return true;
		}

		const fresh = activities.filter(
			({ created, content }) =>
				time(created) > since && content?.repository?.id === repositoryId,
		);
		if (fresh.length === 0) {
			// push の記録がアクティビティに出るまで遅れる場合がある。基準値を進めると
			// その push を永久に見逃すので待つが、記録されない push で無限に待たないよう打ち切る。
			lagTicks++;
			if (lagTicks >= MAX_ACTIVITY_LAG_TICKS) settle(pushedAt);
			return false;
		}

		settle(pushedAt);
		const refs = new Set([`refs/heads/${branch}`, `refs/heads/${base}`]);
		return fresh.some(({ content }) => refs.has(content?.ref ?? ""));
	};
}
