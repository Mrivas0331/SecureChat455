export const load = async (event) => {
  return {
    cookies: event.cookies
      .getAll()
      .reduce(
        (obj, item) => Object.assign(obj, { [item.name]: item.value }),
        {}
      ),
    socket_url: "wss://45.49.193.179:49153/", // prod
    // socket_url: "https://localhost:5433/", // websocket url for development/self testing
  };
};
