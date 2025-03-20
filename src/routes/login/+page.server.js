import { redirect } from "@sveltejs/kit";
import { io } from "socket.io-client";
import { hash } from "bcrypt";

export const load = async (event) => {
  const { cookies } = event;
  if (cookies.get("flash")) {
    cookies.delete("flash", { path: "/" });
  }
  if (cookies.get("session")) {
    cookies.delete("session", { path: "/" });
  }
  if (cookies.get("username")) {
    cookies.delete("username", { path: "/" });
  }
};

export const actions = {
  login: async (event) => {
    const { request, cookies } = event;

    // Verify form data
    const formData = await request.formData();
    const username = formData.get("username");
    const password = formData.get("password");
    const ws_url = formData.get("ws_url");
    if (!username || !password || !ws_url) {
      cookies.set("flash", "login | error missing", { path: "/" });
      return JSON.stringify({});
    }

    // Make HTTPS Request to express server
    let https_url = ws_url.replace("wss://", "https://");
    if (https_url.endsWith("/")) {
      https_url = https_url.slice(0, -1);
    }
    const response = await fetch(`${https_url}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    // Interpret response
    if (response.status === 200) {
      const data = await response.json();
      cookies.set("session", data.session_token, { path: "/", maxAge: 172800 });
      return redirect(303, "/");
    } else if (response.status === 400) {
      cookies.set("flash", "login | error wrong", { path: "/" });
      return JSON.stringify({});
    } else if (response.status === 429) {
      cookies.set("flash", "login | error limited", { path: "/" });
      return JSON.stringify({});
    } else {
      cookies.set("flash", "signup | error server", { path: "/" });
      return JSON.stringify({});
    }
  },
};
