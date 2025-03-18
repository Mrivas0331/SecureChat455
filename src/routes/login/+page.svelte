<script lang="js">
  import { onMount } from 'svelte';
  import { page } from '$app/state';

  let logindata = {
    username: '',
    password: ''
  }
</script>

<form method="POST" action="?/login" class="col-form">
  <label for="username" class="space-top">Username:</label>
  <input type="text" id="username" name="username" bind:value={logindata.username} required class="space-top">
  <label for="password" class="space-top">Password:</label>
  <input type="password" id="password" name="password" bind:value={logindata.password} required class="space-top">
  <button type="submit" class="space-top">Log in</button>
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
