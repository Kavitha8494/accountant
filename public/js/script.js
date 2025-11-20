document.querySelectorAll("[data-include]").forEach(async (el) => {
  let file = el.getAttribute("data-include");
  let response = await fetch(file);
  let content = await response.text();
  el.innerHTML = content;
});
