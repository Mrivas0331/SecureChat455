export const load = async (event) => {
  return {
    cookies: event.cookies
      .getAll()
      .reduce(
        (obj, item) => Object.assign(obj, { [item.name]: item.value }),
        {}
      ),
    // This is the important one to change
    socket_url: "https://localhost:5454",
  };
};
