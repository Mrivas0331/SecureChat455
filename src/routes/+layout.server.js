export const load = async (event) => {
  const { cookies } = event;
  let socket_url = "wss://45.49.193.179:49153/"; // prod
  // socket_url = "https://localhost:5433/"; // dev
  if (!cookies.get("ws_url") || cookies.get("ws_url") !== socket_url) {
    cookies.set("ws_url", socket_url, { path: "/" });
  }
  return {
    cookies: event.cookies
      .getAll()
      .reduce(
        (obj, item) => Object.assign(obj, { [item.name]: item.value }),
        {}
      ),
    socket_url,
  };
};
