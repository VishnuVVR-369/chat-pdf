/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as chatCompletion from "../chatCompletion.js";
import type * as chatData from "../chatData.js";
import type * as chatHelpers from "../chatHelpers.js";
import type * as chatStream from "../chatStream.js";
import type * as documentChunking from "../documentChunking.js";
import type * as documentProcessing from "../documentProcessing.js";
import type * as documentUploadTargets from "../documentUploadTargets.js";
import type * as documentUploads from "../documentUploads.js";
import type * as documents from "../documents.js";
import type * as evaluationConstants from "../evaluationConstants.js";
import type * as evaluationData from "../evaluationData.js";
import type * as evaluations from "../evaluations.js";
import type * as http from "../http.js";
import type * as modelCapabilities from "../modelCapabilities.js";
import type * as openAi from "../openAi.js";
import type * as storageData from "../storageData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chatCompletion: typeof chatCompletion;
  chatData: typeof chatData;
  chatHelpers: typeof chatHelpers;
  chatStream: typeof chatStream;
  documentChunking: typeof documentChunking;
  documentProcessing: typeof documentProcessing;
  documentUploadTargets: typeof documentUploadTargets;
  documentUploads: typeof documentUploads;
  documents: typeof documents;
  evaluationConstants: typeof evaluationConstants;
  evaluationData: typeof evaluationData;
  evaluations: typeof evaluations;
  http: typeof http;
  modelCapabilities: typeof modelCapabilities;
  openAi: typeof openAi;
  storageData: typeof storageData;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
