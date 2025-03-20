<script lang="js">
  import { page } from '$app/state';
</script>

<title>SecureChat</title>

<h1>Welcome to Secure Chat</h1>

{#if page.data.cookies.session}
  <h2>Already logged in</h2>
  <a href="/chat"><button>Go to chat</button></a>
  <a href="/login"><button>Logout</button></a>
{:else}
  <h2>Are you returning?</h2>
  <a href="/login"><button>Login</button></a>

  <h2>Or are you newgen?</h2>
  <a href="/signup"><button>Signup</button></a>
{/if}
