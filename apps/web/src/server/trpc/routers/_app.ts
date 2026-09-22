import { authRouter } from "@/app/(auth)/_utils/trpc-router";
import { authenticatedRouter } from "@/app/(authenticated)/_utils/trpc-router";
import { authenticationFeatureRouter } from "@/app/_features/auth/_utils/trpc-router";
import { githubFeatureRouter } from "@/app/_features/github/_utils/trpc-router";
import { organizationFeatureRouter } from "@/app/_features/organization/_utils/trpc-router";
import { subscriptionFeatureRouter } from "@/app/_features/subscription/_utils/trpc-router";
import { adminRouter } from "@/app/admin/_utils/trpc-router";
import { onboardingRouter } from "@/app/onboarding/_utils/trpc-router";
import { mergeRouters, router } from "../trpc";
import { getPlaneExport } from "@/app/(authenticated)/(project)/inbox/_features/feedback-panel/get-plane-export.trpc.query";
import { createPlaneIssueForFeedback } from "@/app/(authenticated)/(project)/inbox/_features/feedback-panel/create-plane-issue-for-feedback.trpc.mutation";
import { feedbackDiscussionRouter } from "@/app/(authenticated)/(project)/inbox/_features/feedback-discussion/discussion-router";

export const appRouter = router({
  planeFeedback: router({
    getExport: getPlaneExport,
    createIssue: createPlaneIssueForFeedback,
  }),
  feedbackDiscussion: feedbackDiscussionRouter,
  auth: mergeRouters(authRouter, authenticationFeatureRouter),
  authenticated: authenticatedRouter,
  onboarding: onboardingRouter,
  admin: adminRouter,
  github: githubFeatureRouter,
  organization: organizationFeatureRouter,
  subscription: subscriptionFeatureRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
