<script lang="js">
  import { onMount } from "svelte";
  import { page } from "$app/state";

  let signupdata = {
    username: "",
    password: "",
    ws_url: page.data.socket_url,
  };

  onMount(() => {
    // Check for flash cookie
    const flash = page.data.cookies.flash;
    if (flash === undefined) return;
    console.log(`Flash Cookie Found: ${flash}`);

    // Check if flash cookie is valid for this page
    if (flash.split("|").length !== 2) return;
    if (flash.split("|")[0] !== "signup ") return;

    // Interpret flash cookie
    const flashmsg = flash.split("|")[1];
    if (flashmsg === " successful") {
      if (confirm("Signup Successful! Want to go straight to chat?")) {
        window.location.href = "/chat";
      } else {
        window.location.href = "/";
      }
    } else if (flashmsg === " error missing") {
      alert("Error: Missing username or password");
    } else if (flashmsg === " error forbidden") {
      alert('Error: Can\'t use the character "_" in username or password');
    } else if (flashmsg === " error exists") {
      alert("Error: Username already exists");
    } else if (flashmsg === " error server") {
      alert("Internal Server Error");
    }
  });
</script>

<title>SecureChat | SignUp</title>
<form method="POST" action="?/signup" class="col-form">
  <label for="username" class="space-top">Username:</label>
  <input
    type="text"
    id="username"
    name="username"
    bind:value={signupdata.username}
    required
    class="space-top"
  />
  <label for="password" class="space-top">Password:</label>
  <input
    type="password"
    id="password"
    name="password"
    bind:value={signupdata.password}
    required
    class="space-top"
  />
  <button type="submit" class="space-top">Signup</button>
  <input type="hidden" name="ws_url" value={signupdata.ws_url} />
</form>

<style>
  .col-form {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .space-top {
    margin-top: 1rem;
  }
</style>
