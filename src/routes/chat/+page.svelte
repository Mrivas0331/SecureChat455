<script lang="js">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { io } from "socket.io-client";

  const username = page.data.username;
  const session = page.data.session;
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
  };
</script>

<title>SecureChat | Chat</title>

<h1>Logged in as {username || '???'}</h1>
