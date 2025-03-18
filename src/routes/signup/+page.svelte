<script lang="js">
  import { onMount } from 'svelte';
  import { page } from '$app/state';

  let signupdata = {
    username: '',
    password: ''
  }
</script>

<form method="POST" action="?/signup" class="col-form">
  <label for="username" class="space-top">Username:</label>
  <input type="text" id="username" name="username" bind:value={signupdata.username} required class="space-top">
  <label for="password" class="space-top">Password:</label>
  <input type="password" id="password" name="password" bind:value={signupdata.password} required class="space-top">
  <button type="submit" class="space-top">Signup</button>
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
