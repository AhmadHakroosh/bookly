/* Bookly embed.
 * Inline:  <div data-bookly="https://book.example.com/ahmad/intro"></div><script src="https://book.example.com/embed.js" async></script>
 * Popup:   <button data-bookly-popup="https://book.example.com/ahmad/intro">Book a call</button><script src="https://book.example.com/embed.js" async></script>
 */
(function () {
  function frame(url, height) {
    var f = document.createElement("iframe");
    f.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "embed=1";
    f.style.cssText =
      "width:100%;height:" +
      (height || 720) +
      "px;border:0;border-radius:12px;background:transparent";
    f.setAttribute("loading", "lazy");
    f.setAttribute("title", "Booking");
    return f;
  }
  function inline() {
    document.querySelectorAll("[data-bookly]").forEach(function (el) {
      if (el.getAttribute("data-bookly-mounted")) return;
      el.setAttribute("data-bookly-mounted", "1");
      el.appendChild(frame(el.getAttribute("data-bookly"), el.getAttribute("data-height")));
    });
  }
  function popup(url) {
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px";
    var box = document.createElement("div");
    box.style.cssText =
      "width:min(960px,100%);height:min(760px,100%);background:#fff;border-radius:16px;overflow:hidden;position:relative";
    var close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.style.cssText =
      "position:absolute;top:8px;right:12px;font-size:24px;border:0;background:transparent;cursor:pointer;z-index:1";
    close.onclick = function () {
      overlay.remove();
    };
    overlay.onclick = function (e) {
      if (e.target === overlay) overlay.remove();
    };
    var f = frame(url, 760);
    f.style.height = "100%";
    box.appendChild(close);
    box.appendChild(f);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-bookly-popup]");
    if (!t) return;
    e.preventDefault();
    popup(t.getAttribute("data-bookly-popup"));
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inline);
  else inline();
  window.Bookly = { popup: popup, inline: inline };
})();
