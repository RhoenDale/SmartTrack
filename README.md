
  # User Authentication Flow

  This is a code bundle for User Authentication Flow. The original project is available at https://www.figma.com/design/3a1fL8L4uGOs6IYdX8PxnV/User-Authentication-Flow.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Local API setup (Windows and macOS)

  SmartTrack's PHP API requires Apache and MySQL. Install XAMPP, start both
  services, and create/import the `smarttrack` database. On a fresh checkout,
  copy `api/config.example.php` to `api/config.php`; edit the database settings
  in `api/config.php` if your MySQL credentials differ. The local config file is
  intentionally ignored by Git.

  On Windows, run `Copy-Item api/config.example.php api/config.php` in
  PowerShell. On macOS, run `cp api/config.example.php api/config.php` from the
  project directory. Start Apache and MySQL from the XAMPP Control Panel
  (Windows) or XAMPP Manager (macOS).

  The Vite development server proxies API requests to `http://127.0.0.1:80`.
  If Apache uses a different port, set `VITE_API_PROXY_TARGET` in `.env`, for
  example `VITE_API_PROXY_TARGET=http://127.0.0.1:8080`, then restart Vite.

  Electron package builds are written to `~/SmartTrack-release` (the current
  user's home directory) to avoid Windows file-lock issues in XAMPP's `htdocs`.
  