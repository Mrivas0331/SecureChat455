<script lang="js">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { io } from "socket.io-client";
  import { marked } from "marked";
  import { createPicker } from "picmo";

  function mdToHtml(md) {
    return marked(md);
  }

  const username = page.data.username;
  const session = page.data.session_token;
  const socket_url = page.data.socket_url;

  let msgInputField = "";
  let fileInputElement = null;

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

  let chats = [];

  let chatting_with = "";

  // Handles sending messages and files
  let send_message = () => {
    alert("wait for connection");
  };
  let send_file = () => {
    alert("wait for connection");
  };

  // Run when a user goes online, adds a Chat object to the chats array
  function userOnline(user, old_messages) {
    chats.push({
      user1: username < user ? username : user,
      user2: username < user ? user : username,
      messages: old_messages.map((message) => {
        return {
          sender: message.sender,
          htmlContent: mdToHtml(message.content),
          content: message.content,
        };
      }),
      user1_last_activity: "",
      user2_last_activity: "",
      show_typing: false,
    });
    chats = [...chats];
  }

  // Run when a user goes offline, removes the Chat object from the chats array
  function userOffline(user) {
    const index = chats.findIndex(
      (chat) => chat.user1 === user || chat.user2 === user
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
        (chat.user1 === reciever && chat.user2 === sender)
    );
    if (chat === undefined) {
      return;
    } else {
      chat.messages.push({
        sender,
        content: message,
        htmlContent: mdToHtml(message),
      });
      chats = [...chats];
    }
  }

  // Run when a user sends a file, adds the file to the appropriate Chat object
  function recvFile(sender, reciever, fileData) {
    const chat = chats.find(
      (chat) =>
        (chat.user1 === sender && chat.user2 === reciever) ||
        (chat.user1 === reciever && chat.user2 === sender)
    );
    if (chat === undefined) {
      return;
    } else {
      const binaryData = new Uint8Array(fileData.data);
      const blob = new Blob([binaryData], { type: fileData.type });
      const url = URL.createObjectURL(blob);

      if (fileData.type.startsWith("image/")) {
        chat.messages.push({
          sender,
          isImage: true,
          imageUrl: url,
          name: fileData.name,
        });
      } else {
        chat.messages.push({
          sender,
          isFile: true,
          fileUrl: url,
          fileName: fileData.name,
        });
      }
      chats = [...chats];
    }
  }

  onMount(() => {
    verifyFlash();

    const pickerRoot = document.querySelector("#pickerContainer");
    const picker = createPicker({ rootElement: pickerRoot });
    picker.addEventListener("emoji:select", (event) => {
      msgInputField += event.emoji;
    });

    // Connect to socket server
    const socket = io(socket_url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      //transports: ["websocket"],
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
          "You have been disconnected from the server for an unknown reason"
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
        JSON.stringify({ username, session_token: session })
      );
    });

    // Respond to server heartbeats
    socket.on("heartbeat", () => {
      console.log("Received heartbeat request from server, sending response");
      socket.emit(
        "heartbeat",
        JSON.stringify({ username, session_token: session })
      );
    });

    // Add user to chat list when they join
    socket.on("join", (dat) => {
      const data = JSON.parse(dat);
      const { username, messages } = data;
      // if user already in chats for some reason remove them first
      userOffline(username);
      userOnline(username, messages);
    });

    // Remove user from chat list when they leave
    socket.on("leave", (dat) => {
      const data = JSON.parse(dat);
      const { username } = data;
      console.log("User left: " + username);
      userOffline(username);
    });

    // Define Send Message function
    send_message = () => {
      if (!chatting_with) return;
      if (!msgInputField) return;
      const message = msgInputField;
      msgInputField = "";
      socket.emit(
        "message",
        JSON.stringify({
          username,
          to: chatting_with,
          message,
          session_token: session,
        })
      );
    };

    // Define Send File function
    send_file = () => {
      if (!chatting_with) return;
      if (!fileInputElement?.files || !fileInputElement.files[0]) return;
      const file = fileInputElement.files[0];

      const chunkSize = 1024 * 64;
      const reader = new FileReader();

      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        const binaryData = new Uint8Array(arrayBuffer);
        const totalChunks = Math.ceil(binaryData.length / chunkSize);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, binaryData.length);
          const chunk = binaryData.slice(start, end);

          const chunk_message = {
            type: "fileChunk",
            fileName: file.name,
            mimeType: file.type,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            data: Array.from(chunk),
            username: username,
            session_token: session,
          };

          socket.emit("fileChunk", JSON.stringify(chunk_message));
        }

        socket.emit(
          "fileEnd",
          JSON.stringify({
            username,
            to: chatting_with,
            session_token: session,
            totalChunks,
            fileName: file.name,
            mimeType: file.type,
          })
        );
        fileInputElement.value = "";
      };

      reader.readAsArrayBuffer(file);
    };

    // Handle incoming messages
    socket.on("message", (dat) => {
      const data = JSON.parse(dat);
      const { sender, reciever, message } = data;
      recvMessage(sender, reciever, message);
    });

    // Handle incoming files
    socket.on("file", (dat) => {
      const data = JSON.parse(dat);
      const { sender, reciever, fileData } = data;
      recvFile(sender, reciever, fileData);
    });
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

<h3>
  {chatting_with === ""
    ? "Click someone to start a chat"
    : `Chatting with ${chatting_with}`}
</h3>
<br />
{#if chatting_with !== "" && chats.find((chat) => chat.user1 === chatting_with || chat.user2 === chatting_with)}
  <div class="message-display">
    {#each chats.find((chat) => chat.user1 === chatting_with || chat.user2 === chatting_with).messages || [] as message}
      {#if message.isImage}
        <div>
          <b>{message.sender}</b>:
        </div>
        <img src={message.imageUrl} alt={message.name} class="in-chat-image" />
      {:else if message.isFile}
        <div>
          <b>{message.sender}</b>:
          <a href={message.fileUrl} download={message.fileName}>
            {message.fileName}
          </a>
        </div>
      {:else if message.htmlContent}
        <div class="row-msg">
          <p>{message.sender}:</p>
          {@html message.htmlContent}
        </div>
      {:else}
        <div>
          <b>{message.sender}:</b>
          {message.content}
        </div>
      {/if}
    {/each}
  </div>
  <br />
{/if}
<div
  class={(chatting_with !== "" &&
  chats.find(
    (chat) => chat.user1 === chatting_with || chat.user2 === chatting_with
  )
    ? ""
    : "invisible") + " sep_input_fields"}
>
  <div>
    <input
      type="text"
      bind:value={msgInputField}
      placeholder="Type a message..."
    />
    <button onclick={send_message}>Send</button>
    <br />
    <br />
    <input type="file" bind:this={fileInputElement} />
    <button onclick={send_file}>Send File</button>
  </div>
  <div class="picker_spacer"><div id="pickerContainer"></div></div>
</div>

<style>
  .sep_input_fields {
    display: flex;
    flex-direction: row;
  }
  .picker_spacer {
    margin-left: 1rem;
    margin-bottom: 5rem;
  }
  .invisible {
    opacity: 0;
  }
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
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
  }
  .in-chat-image {
    max-height: 75%;
    max-width: 80%;
    margin-top: 0.5rem;
    margin-left: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .row-msg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    margin-top: 0;
    margin-bottom: 0;
  }
  .row-msg > p {
    font-weight: bold;
    margin-right: 0.5rem;
  }
</style>