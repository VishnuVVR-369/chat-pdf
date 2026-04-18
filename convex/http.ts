import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { streamChat } from "./chatStream";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/api/chat/stream",
  method: "POST",
  handler: streamChat,
});

http.route({
  path: "/api/chat/stream",
  method: "OPTIONS",
  handler: streamChat,
});

export default http;
