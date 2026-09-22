using System;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace LuniraScreen
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Application.ThreadException += (sender, args) =>
                ShowFatal("Erro inesperado na interface.", args.Exception);

            AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
                ShowFatal("Erro inesperado no aplicativo.", args.ExceptionObject as Exception);

            TaskScheduler.UnobservedTaskException += (sender, args) =>
            {
                ShowFatal("Erro assíncrono inesperado.", args.Exception);
                args.SetObserved();
            };

            try
            {
                Application.Run(new MainForm());
            }
            catch (Exception ex)
            {
                ShowFatal("Não foi possível iniciar o Lunira Screen.", ex);
            }
        }

        private static void ShowFatal(string title, Exception ex)
        {
            var builder = new StringBuilder();
            builder.AppendLine(title);
            builder.AppendLine();
            builder.AppendLine(ex != null ? ex.Message : "Erro desconhecido.");

            if (ex != null && ex.InnerException != null)
            {
                builder.AppendLine();
                builder.AppendLine(ex.InnerException.Message);
            }

            try
            {
                MessageBox.Show(
                    builder.ToString(),
                    "Lunira Screen",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch
            {
            }
        }
    }
}
