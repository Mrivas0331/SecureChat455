<script lang="js">
  import { page } from '$app/state';

  const socket_url = page.data.socket_url;
</script>

<title>SecureChat</title>

<h1>Welcome to Secure Chat</h1>

<h2>Are you returning?</h2>
<a href="/login"><button>Login</button></a>

<h2>Or are you newgen?</h2>
<a href="/login"><button>Signup</button></a>
