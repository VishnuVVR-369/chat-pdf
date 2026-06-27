import { httpRouter } from "convex/server";
import { streamChat } from "./chatStream";

const http = httpRouter();

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
