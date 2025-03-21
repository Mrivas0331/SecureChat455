<script lang="js">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { io } from "socket.io-client";

  const username = page.data.username;
  const session = page.data.session_token;
  const socket_url = page.data.socket_url;

  let msgInputField = "";

  function verifyFlash() {
    // Check for flash cookie
    const flash = page.data.cookies.flash;
    if (flash === undefined) return;
    console.log(`Flash Cookie Found: ${flash}`);

    // Check if flash cookie is valid for this page
    if (flash.split("|").length !== 2) return;
    if (flash.split("|")[0] !== "chat ") return;

    // Interpret flash cookie
    const flashmsg = flash.split("|")[1];
    if (flashmsg === " error invalid") {
      alert("Error: Missing or invalid session token. Please log in again");
      window.location.href = "/login";
    } else if (flashmsg === " error expired") {
      alert("Error: Session token expired. Please log in again");
      window.location.href = "/login";
    } else if (flashmsg === " error server") {
      alert("Internal Server Error");
    }
  }

  // Note that all chats are one-to-one. I.e. if I have a chat with a user named
  // "hannah", then the chat object will contain all messages between me and
  // "hannah".

  /**
   * The expected type of a single "message"
   * @typedef {Object} Message
   * @property {string} sender - The username of the sender
   * @property {string} content - The content of the message
   * @property {string} timestamp - The timestamp of the message
   */

  /**
   * The expected type of a single "chat"
   * @typedef {Object} Chat
   * @property {string} user1 - The username of the first user. User 1 is decided by alphabetical order
   * @property {string} user2 - The username of the second user. User 2 is decided by alphabetical order
   * @property {Message[]} messages - An array of messages between the two users
   * @property {string} user1_last_activity - The timestamp of the last typing activity of user 1
   * @property {string} user2_last_activity - The timestamp of the last typing activity of user 2
   * @property {bool} show_typing - Whether to show the typing indicator for the chat
   */

  /** @type {Chat[]} */
  let chats = [];

  let chatting_with = "";

  // Run when a user goes online, adds a Chat object to the chats array
  function userOnline(user, old_messages) {
    chats.push({
      user1: username < user ? username : user,
      user2: username < user ? user : username,
      messages: old_messages,
      user1_last_activity: "",
      user2_last_activity: "",
      show_typing: false,
    });
    chats = [...chats];
  }

  // Run when a user goes offline, removes the Chat object from the chats array
  function userOffline(user) {
    const index = chats.findIndex(
      (chat) => chat.user1 === user || chat.user2 === user,
    );
    if (index !== -1) chats.splice(index, 1);
    if (chatting_with === user) chatting_with = "";
    chats = [...chats];
  }

  // Run when a user sends a message, adds the message to the appropriate Chat object
  function recvMessage(sender, reciever, message) {
    const chat = chats.find(
      (chat) =>
        (chat.user1 === sender && chat.user2 === reciever) ||
        (chat.user1 === reciever && chat.user2 === sender),
    );
    if (chat === undefined) {
      return;
    } else {
      chat.messages.push({ sender, content: message });
      chats = [...chats];
    }
  }

  onMount(() => {
    verifyFlash();

    // Connect to socket server
    const socket = io(socket_url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      transports: ["websocket"],
    });

    // Handle disconnects
    socket.on("disconnect", (reason) => {
      return;
      if (reason === "io server disconnect") {
        alert("You have been disconnected from the server for session timeout");
        window.location.href = "/login";
      } else if (reason === "io client disconnect") {
        alert("You successfully disconnected from the server");
        window.location.href = "/";
      } else {
        alert(
          "You have been disconnected from the server for an unknown reason",
        );
        window.location.href = "/login";
      }
    });

    // Verify on connection start
    socket.on("connect", async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log("Connected to server");
      socket.emit(
        "verify",
        JSON.stringify({ username, session_token: session }),
      );
    });

    // Respond to server heartbeats
    socket.on("heartbeat", () => {
      console.log("Received heartbeat request from server, sending response");
      socket.emit(
        "heartbeat",
        JSON.stringify({ username, session_token: session }),
      );
    });

    console.log("Added max");
    userOnline("max", []);
    console.log("Added mark");
    userOnline("mark", []);
    console.log("Added elzie");
    userOnline("elzie", []);
    // push 4 messages to hannah
    recvMessage("max", username, "Hello");
    recvMessage(username, "max", "How are you?");
    recvMessage("max", username, "I'm good");
    recvMessage(username, "max", "ok");
  });
</script>

<title>SecureChat | Chat</title>

<h1>Logged in as {username || "???"}</h1>
<br />

<h3>Pick someone to chat with:</h3>
<br />

<div class="chats-selection">
  {#each chats as chat}
    <button
      style={(
        chat.user1 === username
          ? chat.user2 === chatting_with
          : chat.user1 === chatting_with
      )
        ? "text-decoration: underline; margin: 5px;"
        : "margin: 5px;"}
      onclick={() =>
        (chatting_with = chat.user1 === username ? chat.user2 : chat.user1)}
      aria-pressed="false"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === "Enter") {
          chatting_with = chat.user1 === username ? chat.user2 : chat.user1;
        }
      }}
    >
      {chat.user1 === username ? chat.user2 : chat.user1}
    </button>
  {/each}
</div>
<br />

<!-- If "chatting_with" is not empty and there exists an entry in chats that has one of those users  -->
{#each chats as chat}
  {#if (chat.user1 === chatting_with || chat.user2 === chatting_with) && chatting_with !== ""}
    <h3>Chatting with {chatting_with}</h3>
    <br />
    <div class="message-display">
      {#each chat.messages as message}
        <div>
          <b>{message.sender}</b>: {message.content}
        </div>
      {/each}
    </div>
    <br />
    <input
      type="text"
      bind:value={msgInputField}
      placeholder="Type a message..."
    />
    <button>Send</button>
  {/if}
{/each}

<style>
  .chats-selection {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .message-display {
    border: 1px solid black;
    height: 40vh;
    min-height: 200px;
    width: 80vw;
    max-width: 800px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
  }
</style>
