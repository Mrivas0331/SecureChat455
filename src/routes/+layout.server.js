export const load = async (event) => {
  return {
    cookies: event.cookies
      .getAll()
      .reduce(
        (obj, item) => Object.assign(obj, { [item.name]: item.value }),
        {}
      ),
    // Make sure to change this if necessary
    socket_url: "wss://45.49.193.179:49153/",
  };
};
