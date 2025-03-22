import { redirect } from "@sveltejs/kit";
import { io } from "socket.io-client";
import { hash } from "bcrypt";

export const load = async (event) => {
  const { cookies } = event;
  if (cookies.get("flash")) {
    cookies.delete("flash", { path: "/" });
  }
};

export const actions = {
  signup: async (event) => {
    const { request, cookies } = event;

    // Verify form data
    const formData = await request.formData();
    const username = formData.get("username");
    const password = formData.get("password");
    const ws_url = formData.get("ws_url");
    if (!username || !password || !ws_url) {
      cookies.set("flash", "signup | error missing", { path: "/" });
      return JSON.stringify({});
    }
    
    // Ensure usernames contain no spaces, or special characters. Just caps/lowercase/numbers
    if (!/^[a-zA-Z0-9]*$/.test(username)) {
      cookies.set("flash", "signup | error username", { path: "/" });
      return JSON.stringify({});
    }

    const hashedPassword = await hash(password, 10);

    // Make HTTPS Request to express server
    let https_url = ws_url.replace("wss://", "https://");
    if (https_url.endsWith("/")) {
      https_url = https_url.slice(0, -1);
    }
    const response = await fetch(`${https_url}/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password: hashedPassword }),
    });

    // Interpret response
    if (response.status === 201) {
      const data = await response.json();
      cookies.set("session", data.session_token, { path: "/", maxAge: 172800 });
      cookies.set("flash", "signup | successful", { path: "/" });
      return JSON.stringify({});
    } else if (response.status === 400) {
      cookies.set("flash", "signup | error exists", { path: "/" });
      return JSON.stringify({});
    } else {
      cookies.set("flash", "signup | error server", { path: "/" });
      return JSON.stringify({});
    }
  },
};
