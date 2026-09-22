using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace LuniraScreen
{
    internal sealed class MainForm : Form
    {
        private const string DefaultWebUrl = "https://lumacast-live-kc.onrender.com/";

        private readonly Panel _statusPanel;
        private readonly Label _titleLabel;
        private readonly Label _messageLabel;
        private readonly Button _retryButton;
        private readonly Button _browserButton;
        private readonly PictureBox _logo;
        private WebView2 _webView;
        private Uri _appUri;
        private bool _initializing;

        public MainForm()
        {
            Text = "Lunira Screen";
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(9, 10, 15);
            ClientSize = new Size(1360, 800);
            MinimumSize = new Size(980, 640);
            KeyPreview = true;

            try
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
            }

            _statusPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(9, 10, 15)
            };

            _logo = new PictureBox
            {
                Width = 72,
                Height = 72,
                SizeMode = PictureBoxSizeMode.Zoom
            };
            try
            {
                using (var icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath))
                {
                    if (icon != null) _logo.Image = icon.ToBitmap();
                }
            }
            catch
            {
            }

            _titleLabel = new Label
            {
                AutoSize = false,
                Height = 40,
                Text = "Lunira Screen",
                ForeColor = Color.FromArgb(245, 244, 250),
                Font = new Font("Segoe UI", 19F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            };

            _messageLabel = new Label
            {
                AutoSize = false,
                Height = 72,
                Text = "Iniciando...",
                ForeColor = Color.FromArgb(155, 157, 173),
                Font = new Font("Segoe UI", 10F),
                TextAlign = ContentAlignment.TopCenter
            };

            _retryButton = NewButton("Tentar novamente");
            _retryButton.Click += async (sender, args) => await InitializeAndNavigateAsync();

            _browserButton = NewButton("Abrir no navegador");
            _browserButton.Click += (sender, args) =>
                OpenExternal((_appUri ?? new Uri(DefaultWebUrl)).AbsoluteUri);

            _statusPanel.Controls.Add(_logo);
            _statusPanel.Controls.Add(_titleLabel);
            _statusPanel.Controls.Add(_messageLabel);
            _statusPanel.Controls.Add(_retryButton);
            _statusPanel.Controls.Add(_browserButton);
            Controls.Add(_statusPanel);

            Resize += (sender, args) => LayoutStatus();
            Shown += async (sender, args) =>
            {
                LayoutStatus();
                _appUri = ResolveAppUri();
                await InitializeAndNavigateAsync();
            };
        }

        private static Button NewButton(string text)
        {
            return new Button
            {
                Text = text,
                Width = 145,
                Height = 38,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(30, 31, 42),
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9F),
                Cursor = Cursors.Hand,
                Visible = false
            };
        }

        private void LayoutStatus()
        {
            var centerX = Math.Max(0, (ClientSize.Width - 440) / 2);
            var top = Math.Max(80, (ClientSize.Height - 270) / 2);

            _logo.Left = (ClientSize.Width - _logo.Width) / 2;
            _logo.Top = top;
            _titleLabel.SetBounds(centerX, top + 88, 440, 40);
            _messageLabel.SetBounds(centerX, top + 136, 440, 72);
            _retryButton.Left = (ClientSize.Width / 2) - _retryButton.Width - 6;
            _retryButton.Top = top + 215;
            _browserButton.Left = (ClientSize.Width / 2) + 6;
            _browserButton.Top = top + 215;
        }

        private Uri ResolveAppUri()
        {
            var cli = Environment.GetCommandLineArgs()
                .FirstOrDefault(value =>
                    value.StartsWith("--app-url=", StringComparison.OrdinalIgnoreCase));

            Uri parsed;
            if (!string.IsNullOrWhiteSpace(cli) &&
                TryNormalizeUrl(cli.Substring("--app-url=".Length), out parsed))
                return parsed;

            if (TryNormalizeUrl(Environment.GetEnvironmentVariable("LUNIRA_WEB_URL"), out parsed))
                return parsed;

            try
            {
                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web-url.txt");
                if (File.Exists(path) && TryNormalizeUrl(File.ReadAllText(path), out parsed))
                    return parsed;
            }
            catch
            {
            }

            return new Uri(DefaultWebUrl);
        }

        private static bool TryNormalizeUrl(string raw, out Uri uri)
        {
            uri = null;
            if (string.IsNullOrWhiteSpace(raw)) return false;

            Uri candidate;
            if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out candidate)) return false;

            var localhost =
                candidate.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                candidate.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase);

            if (!candidate.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                !(localhost && candidate.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)))
                return false;

            uri = candidate;
            return true;
        }

        private async Task InitializeAndNavigateAsync()
        {
            if (_initializing) return;
            _initializing = true;

            try
            {
                ShowStatus("Verificando componentes do Windows...", false);

                try
                {
                    CoreWebView2Environment.GetAvailableBrowserVersionString();
                }
                catch (WebView2RuntimeNotFoundException)
                {
                    ShowStatus(
                        "O Microsoft Edge WebView2 Runtime não está instalado. " +
                        "Reinstale o Lunira Screen para instalar o componente automaticamente.",
                        true);
                    return;
                }

                if (_webView == null || _webView.IsDisposed)
                {
                    _webView = new WebView2
                    {
                        Dock = DockStyle.Fill,
                        Visible = false,
                        DefaultBackgroundColor = Color.FromArgb(9, 10, 15)
                    };
                    Controls.Add(_webView);
                    _webView.BringToFront();

                    ShowStatus("Inicializando o motor do Edge...", false);

                    var userData = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "Lunira Screen",
                        "WebView2");

                    var environment = await CoreWebView2Environment.CreateAsync(null, userData);
                    await _webView.EnsureCoreWebView2Async(environment);

                    _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                    _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                    _webView.CoreWebView2.Settings.AreDevToolsEnabled =
                        Environment.GetCommandLineArgs()
                            .Any(value => value.Equals("--devtools", StringComparison.OrdinalIgnoreCase));

                    _webView.CoreWebView2.PermissionRequested += OnPermissionRequested;
                    _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                    _webView.CoreWebView2.ProcessFailed += OnProcessFailed;
                    _webView.NavigationStarting += OnNavigationStarting;
                    _webView.NavigationCompleted += OnNavigationCompleted;
                }

                ShowStatus("Conectando ao Lunira Screen...", false);
                _webView.Visible = true;
                _webView.CoreWebView2.Navigate(_appUri.AbsoluteUri);
            }
            catch (Exception ex)
            {
                ShowStatus("Falha ao iniciar o aplicativo: " + ex.Message, true);
            }
            finally
            {
                _initializing = false;
            }
        }

        private void OnPermissionRequested(object sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            if (!IsTrustedOrigin(e.Uri))
            {
                e.State = CoreWebView2PermissionState.Deny;
                return;
            }

            if (e.PermissionKind == CoreWebView2PermissionKind.Camera ||
                e.PermissionKind == CoreWebView2PermissionKind.Microphone)
            {
                e.State = CoreWebView2PermissionState.Allow;
                e.SavesInProfile = true;
                return;
            }

            e.State = CoreWebView2PermissionState.Default;
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (IsTrustedOrigin(e.Uri))
            {
                ShowStatus("Carregando...", false);
                return;
            }

            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                _statusPanel.Visible = false;
                _webView.Visible = true;
                return;
            }

            _webView.Visible = false;
            ShowStatus(
                "Não foi possível carregar o site. Erro do WebView2: " +
                e.WebErrorStatus + ". URL: " + _appUri.AbsoluteUri,
                true);
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;

            if (IsTrustedOrigin(e.Uri))
                _webView.CoreWebView2.Navigate(e.Uri);
            else
                OpenExternal(e.Uri);
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            _webView.Visible = false;
            ShowStatus(
                "O processo do navegador interno encerrou: " +
                e.ProcessFailedKind + ". Tente novamente.",
                true);
        }

        private bool IsTrustedOrigin(string raw)
        {
            Uri candidate;
            if (_appUri == null ||
                !Uri.TryCreate(raw, UriKind.Absolute, out candidate))
                return false;

            return
                candidate.Scheme.Equals(_appUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
                candidate.Host.Equals(_appUri.Host, StringComparison.OrdinalIgnoreCase) &&
                candidate.Port == _appUri.Port;
        }

        private void ShowStatus(string message, bool error)
        {
            _statusPanel.Visible = true;
            _statusPanel.BringToFront();
            _messageLabel.Text = message;
            _retryButton.Visible = error;
            _browserButton.Visible = error;
            LayoutStatus();
        }

        private static void OpenExternal(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return;

            try
            {
                Process.Start(new ProcessStartInfo(url)
                {
                    UseShellExecute = true
                });
            }
            catch
            {
            }
        }
    }
}
