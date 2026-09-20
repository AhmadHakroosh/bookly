# Embeds

Add the script once, then use either pattern. Replace the host with your Bookly URL.

```html
<!-- inline -->
<div data-bookly="https://book.example.com/ahmad/intro-call" data-height="720"></div>
<script src="https://book.example.com/embed.js" async></script>

<!-- popup -->
<button data-bookly-popup="https://book.example.com/ahmad/intro-call">Book a call</button>
<script src="https://book.example.com/embed.js" async></script>
```

`window.Bookly.popup(url)` opens the popup programmatically. Plain links to `https://book.example.com/<username>/<event>` also work anywhere. Append `?tz=Europe/Berlin` to preselect a timezone, or `?embed=1` to render without the footer.
