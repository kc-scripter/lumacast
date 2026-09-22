using Microsoft.Web.WebView2.Core;
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;

namespace LuniraScreen
{
    public partial class MainWindow : Window
    {
        private const string DefaultWebUrl = "https://lumacast-live-kc.onrender.com/";
        private Uri _appUri;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            _appUri = ResolveAppUri();
            CurrentUrl.Text = _appUri.AbsoluteUri;
            await InitializeWebViewAsync();
        }

        private Uri ResolveAppUri()
        {
            var cli = Environment.GetCommandLineArgs()
                .FirstOrDefault(value => value.StartsWith("--app-url=", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(cli))
            {
                var value = cli.Substring("--app-url=".Length).Trim();
                Uri cliUri;
                if (TryNormalizeUrl(value, out cliUri)) return cliUri;
            }

            var env = Environment.GetEnvironmentVariable("LUNIRA_WEB_URL");
            Uri envUri;
            if (TryNormalizeUrl(env, out envUri)) return envUri;

            try
            {
                var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web-url.txt");
                if (File.Exists(configPath))
                {
                    var configured = File.ReadAllText(configPath).Trim();
                    Uri fileUri;
                    if (TryNormalizeUrl(configured, out fileUri)) return fileUri;
                }
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

            Uri parsed;
            if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out parsed)) return false;

            var localhost = parsed.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                            parsed.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase);
            if (!parsed.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                !(localhost && parsed.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)))
                return false;

            uri = parsed;
            return true;
        }

        private async Task InitializeWebViewAsync()
        {
            ShowLoading("Conectando ao Lunira Screen...");

            try
            {
                var userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Lunira Screen",
                    "WebView2");

                var environment = await CoreWebView2Environment.CreateAsync(null, userData);
                await Browser.EnsureCoreWebView2Async(environment);

                Browser.CoreWebView2.Settings.AreDevToolsEnabled =
                    Environment.GetCommandLineArgs().Any(value =>
                        value.Equals("--devtools", StringComparison.OrdinalIgnoreCase));
                Browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;

                Browser.CoreWebView2.PermissionRequested += OnPermissionRequested;
                Browser.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                Browser.CoreWebView2.ProcessFailed += OnProcessFailed;
                Browser.NavigationStarting += OnNavigationStarting;
                Browser.NavigationCompleted += OnNavigationCompleted;

                Browser.Visibility = Visibility.Visible;
                Browser.Source = _appUri;
            }
            catch (WebView2RuntimeNotFoundException)
            {
                ShowError(
                    "O Microsoft Edge WebView2 Runtime não está instalado. " +
                    "Instale ou atualize o Microsoft Edge WebView2 Runtime e tente novamente.");
            }
            catch (Exception ex)
            {
                ShowError("Falha ao iniciar o cliente Windows. " + ex.Message);
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
                e.PermissionKind == CoreWebView2PermissionKind.Microphone ||
                e.PermissionKind == CoreWebView2PermissionKind.Autoplay)
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
                ShowLoading("Carregando...");
                return;
            }

            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                LoadingPanel.Visibility = Visibility.Collapsed;
                ErrorPanel.Visibility = Visibility.Collapsed;
                Browser.Visibility = Visibility.Visible;
                return;
            }

            ShowError("A página não carregou. Erro WebView2: " + e.WebErrorStatus + ".");
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            if (IsTrustedOrigin(e.Uri))
            {
                Browser.CoreWebView2.Navigate(e.Uri);
                return;
            }

            OpenExternal(e.Uri);
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            ShowError("O processo de renderização do WebView2 parou: " + e.ProcessFailedKind + ".");
        }

        private bool IsTrustedOrigin(string raw)
        {
            Uri target;
            if (_appUri == null || !Uri.TryCreate(raw, UriKind.Absolute, out target)) return false;
            return target.Scheme.Equals(_appUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
                   target.Host.Equals(_appUri.Host, StringComparison.OrdinalIgnoreCase) &&
                   target.Port == _appUri.Port;
        }

        private void ShowLoading(string message)
        {
            LoadingText.Text = message;
            LoadingPanel.Visibility = Visibility.Visible;
            ErrorPanel.Visibility = Visibility.Collapsed;
        }

        private void ShowError(string message)
        {
            ErrorText.Text = message;
            CurrentUrl.Text = _appUri != null ? _appUri.AbsoluteUri : DefaultWebUrl;
            LoadingPanel.Visibility = Visibility.Collapsed;
            Browser.Visibility = Visibility.Collapsed;
            ErrorPanel.Visibility = Visibility.Visible;
        }

        private void Retry_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CoreWebView2 == null)
            {
                InitializeWebViewAsync();
                return;
            }

            ShowLoading("Tentando novamente...");
            Browser.Visibility = Visibility.Visible;
            Browser.CoreWebView2.Navigate(_appUri.AbsoluteUri);
        }

        private void OpenBrowser_Click(object sender, RoutedEventArgs e)
        {
            OpenExternal(_appUri != null ? _appUri.AbsoluteUri : DefaultWebUrl);
        }

        private static void OpenExternal(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return;
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch
            {
            }
        }
    }
}
