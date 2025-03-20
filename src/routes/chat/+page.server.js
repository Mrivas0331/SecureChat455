import { redirect } from "@sveltejs/kit";
import { io } from "socket.io-client";
import { hash } from "bcrypt";

export const load = async (event) => {
  const { cookies } = event;
  if (cookies.get("flash")) {
    cookies.delete("flash", { path: "/" });
  }
  if (cookies.get("username")) {
    cookies.delete("username", { path: "/" });
  }
  if (!cookies.get("session") || !cookies.get("ws_url")) {
    cookies.set("flash", "chat | error invalid", { path: "/" });
  }

  // Make HTTPS Request to express server
  let https_url = cookies.get("ws_url").replace("wss://", "https://");
  if (https_url.endsWith("/")) {
    https_url = https_url.slice(0, -1);
  }
  const response = await fetch(`${https_url}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_token: cookies.get("session") }),
  });

  // Interpret response
  if (response.status === 200) {
    const data = await response.json();
    const { session_token, username } = data;
    cookies.set("session", session_token, { path: "/", maxAge: 172800 });
    cookies.set("username", username, { path: "/", maxAge: 172800 });
    return { username, session_token };
  } else if (response.status === 400) {
    cookies.set("flash", "chat | error invalid", { path: "/" });
    return {};
  } else if (response.status === 401) {
    cookies.set("flash", "chat | error expired", { path: "/" });
    return {};
  } else {
    cookies.set("flash", "chat | error server", { path: "/" });
    return {};
  }

  cookies.set("flash", "chat | error server", { path: "/" });
  return {};
};
