(() => {
  const cfg = window.CODE_CLASH_CONFIG;
  const $ = (id) => document.getElementById(id);
  const authView = $("authView");
  const lobbyView = $("lobbyView");
  const authMessage = $("authMessage");
  let socket = null;
  let currentUser = null;

  function setMessage(text = "", type = "") {
    authMessage.textContent = text;
    authMessage.className = "message" + (type ? " " + type : "");
  }

  function token() {
    return localStorage.getItem("codeClashToken") || "";
  }

  function showTab(which) {
    const login = which === "login";
    $("loginForm").classList.toggle("hidden", !login);
    $("registerForm").classList.toggle("hidden", login);
    $("loginTab").classList.toggle("active", login);
    $("registerTab").classList.toggle("active", !login);
    setMessage("");
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = "Bearer " + t;
    const response = await fetch(cfg.apiBase + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function saveSession(data) {
    localStorage.setItem("codeClashToken", data.token);
    currentUser = data.user;
    openLobby();
  }

  function openLobby() {
    authView.classList.add("hidden");
    lobbyView.classList.remove("hidden");
    $("welcome").textContent = "Welcome, " + (currentUser?.name || "Player");
    connectPresence();
  }

  function openAuth() {
    currentUser = null;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    localStorage.removeItem("codeClashToken");
    lobbyView.classList.add("hidden");
    authView.classList.remove("hidden");
  }

  function renderPlayers(players) {
    $("onlineCount").textContent = players.length;
    const list = $("onlineList");
    if (!players.length) {
      list.innerHTML = '<div class="empty">Nobody is online yet.</div>';
      return;
    }
    list.innerHTML = players.map((p) => {
      const name = escapeHtml(p.name || "Player");
      const provider = p.provider === "google" ? "Google" : "Email";
      const avatar = p.picture
        ? '<img class="avatar" src="' + escapeAttr(p.picture) + '" alt="">'
        : '<div class="avatar">' + escapeHtml(initials(p.name)) + '</div>';
      return '<article class="player">' + avatar +
        '<div><strong>' + name + '</strong><small>' + provider + ' sign-in</small></div>' +
        '<span class="dot" title="Online"></span></article>';
    }).join("");
  }

  function initials(name = "") {
    return name.trim().split(/\s+/).slice(0, 2).map((x) => x[0] || "").join("").toUpperCase() || "?";
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function connectPresence() {
    if (socket) socket.disconnect();
    socket = io(cfg.apiBase, {
      path: "/games/code-clash/socket.io",
      auth: { token: token() },
      transports: ["polling", "websocket"]
    });
    socket.on("presence", renderPlayers);
    socket.on("connect_error", (err) => {
      if (/unauthor/i.test(err.message || "")) openAuth();
    });
  }

  $("loginTab").addEventListener("click", () => showTab("login"));
  $("registerTab").addEventListener("click", () => showTab("register"));

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Signing in...");
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value })
      });
      setMessage("Signed in.", "success");
      saveSession(data);
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  $("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Creating account...");
    try {
      const data = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: $("registerName").value,
          email: $("registerEmail").value,
          password: $("registerPassword").value
        })
      });
      setMessage("Account created.", "success");
      saveSession(data);
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
    openAuth();
  });

  window.handleGoogleCredential = async (response) => {
    setMessage("Signing in with Google...");
    try {
      const data = await api("/api/google", {
        method: "POST",
        body: JSON.stringify({ credential: response.credential })
      });
      saveSession(data);
    } catch (error) {
      setMessage(error.message, "error");
    }
  };

  function initGoogle() {
    if (!window.google?.accounts?.id) return false;
    if (!cfg.googleClientId) {
      $("googleHint").classList.remove("hidden");
      return true;
    }
    google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: window.handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    google.accounts.id.renderButton($("googleButton"), {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      width: 300
    });
    return true;
  }

  let googleAttempts = 0;
  const googleTimer = setInterval(() => {
    googleAttempts += 1;
    if (initGoogle() || googleAttempts > 30) clearInterval(googleTimer);
  }, 150);

  (async function restore() {
    if (!token()) return;
    try {
      const data = await api("/api/me");
      currentUser = data.user;
      openLobby();
    } catch (_) {
      openAuth();
    }
  })();
})();
