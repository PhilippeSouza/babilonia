using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BabiloniaApp
{
    public class BabiloniaLauncherForm : Form
    {
        // Cores oficiais Dracula Dark Mode
        private static readonly Color BgDark = Color.FromArgb(24, 25, 34);
        private static readonly Color BgCard = Color.FromArgb(40, 42, 54);
        private static readonly Color BgHeader = Color.FromArgb(30, 31, 41);
        private static readonly Color DraculaPurple = Color.FromArgb(189, 147, 249);
        private static readonly Color DraculaPink = Color.FromArgb(255, 121, 198);
        private static readonly Color DraculaCyan = Color.FromArgb(139, 233, 253);
        private static readonly Color DraculaGreen = Color.FromArgb(80, 250, 123);
        private static readonly Color DraculaRed = Color.FromArgb(255, 85, 85);
        private static readonly Color DraculaFg = Color.FromArgb(248, 248, 242);
        private static readonly Color DraculaComment = Color.FromArgb(148, 163, 204);

        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private System.Windows.Forms.Timer statusTimer;
        private Process nodeProcess;
        private string appDir;
        private bool isSimulated = false;

        private Label lblServerStatus;
        private Label lblLcuStatus;
        private Label lblMatchStatus;
        private Button btnToggleSim;

        // Suporte para arrastar a janela sem borda padrão do Windows
        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HT_CAPTION = 0x2;

        public BabiloniaLauncherForm()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            InitializeComponent();
            StartBackendIfNeeded();
        }

        private void InitializeComponent()
        {
            this.Text = "BABILÔNIA — LoL Companion & Coach IA";
            this.Size = new Size(480, 620);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.None;
            this.BackColor = BgDark;
            this.ForeColor = DraculaFg;
            this.DoubleBuffered = true;
            this.ShowInTaskbar = true; // Garante o ícone na Barra de Tarefas do Sistema Operacional

            // Carrega o ícone embutido no próprio executável ou do arquivo Babilonia.ico
            Icon appIcon = LoadAppIcon();
            if (appIcon != null)
            {
                this.Icon = appIcon;
            }

            // ====================================================================
            // 1. ÍCONE NA BANDEJA DO SISTEMA (SYSTEM TRAY) + MENU DE CONTEXTO
            // ====================================================================
            trayMenu = new ContextMenuStrip();
            trayMenu.BackColor = BgCard;
            trayMenu.ForeColor = DraculaFg;

            var itemOpenMain = new ToolStripMenuItem("⚡ Abrir Painel Babilônia Completo", null, (s, e) => OpenAppWindow(false));
            var itemOpenOverlay = new ToolStripMenuItem("🪟 Abrir Mini Overlay Compacto", null, (s, e) => OpenAppWindow(true));
            var itemShowController = new ToolStripMenuItem("🎛️ Mostrar Central Babilônia", null, (s, e) => RestoreFromTray());
            var itemToggleSim = new ToolStripMenuItem("🎮 Alternar Simulação de Partida", null, (s, e) => ToggleSimulation());
            var itemExit = new ToolStripMenuItem("❌ Fechar Babilônia Completo", null, (s, e) => ExitApplication());

            trayMenu.Items.Add(itemOpenMain);
            trayMenu.Items.Add(itemOpenOverlay);
            trayMenu.Items.Add(itemToggleSim);
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add(itemShowController);
            trayMenu.Items.Add(itemExit);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "BABILÔNIA — LoL Companion (Ativo)";
            trayIcon.Icon = appIcon ?? SystemIcons.Application;
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => RestoreFromTray();

            // ====================================================================
            // 2. BARRA DE TÍTULO CUSTOMIZADA DRACULA (ARRASTÁVEL)
            // ====================================================================
            Panel titleBar = new Panel
            {
                Dock = DockStyle.Top,
                Height = 44,
                BackColor = BgHeader
            };
            titleBar.MouseDown += DragWindow_MouseDown;

            Label titleLabel = new Label
            {
                Text = "⚡ BABILÔNIA DESKTOP • DRACULA EDITION",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = DraculaPurple,
                AutoSize = true,
                Location = new Point(16, 13)
            };
            titleLabel.MouseDown += DragWindow_MouseDown;

            Button btnMinTaskbar = CreateHeaderButton("—", new Point(388, 7), BgCard, DraculaFg);
            btnMinTaskbar.Click += (s, e) => { this.WindowState = FormWindowState.Minimized; };

            Button btnCloseToTray = CreateHeaderButton("✕", new Point(432, 7), DraculaRed, Color.White);
            btnCloseToTray.Click += (s, e) => MinimizeToTray();

            titleBar.Controls.Add(titleLabel);
            titleBar.Controls.Add(btnMinTaskbar);
            titleBar.Controls.Add(btnCloseToTray);
            this.Controls.Add(titleBar);

            // ====================================================================
            // 3. HERO HEADER COM A NOVA LOGO REALISTA TRAÇADA
            // ====================================================================
            PictureBox logoBox = new PictureBox
            {
                Size = new Size(138, 138),
                Location = new Point(28, 62),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Transparent
            };
            string pngPath = Path.Combine(appDir, "public", "logo.png");
            if (File.Exists(pngPath))
            {
                using (var fs = new FileStream(pngPath, FileMode.Open, FileAccess.Read))
                {
                    logoBox.Image = Image.FromStream(fs);
                }
            }
            this.Controls.Add(logoBox);

            Label lblBrandTitle = new Label
            {
                Text = "BABILÔNIA",
                Font = new Font("Segoe UI", 22f, FontStyle.Bold),
                ForeColor = DraculaFg,
                AutoSize = true,
                Location = new Point(180, 68)
            };
            this.Controls.Add(lblBrandTitle);

            Label lblBrandSub = new Label
            {
                Text = "LoL Companion • 6 Meta Picks • 3 Builds\nCoach Visual Silencioso (100% Seguro)",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = DraculaCyan,
                AutoSize = true,
                Location = new Point(184, 112)
            };
            this.Controls.Add(lblBrandSub);

            Label lblActivePill = new Label
            {
                Text = "🟢 ÍCONE ATIVO NA BARRA DO SISTEMA",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = DraculaGreen,
                BackColor = Color.FromArgb(30, 55, 45),
                AutoSize = false,
                Size = new Size(255, 26),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(184, 162)
            };
            this.Controls.Add(lblActivePill);

            // ====================================================================
            // 4. PAINEL DE TELEMETRIA AO VIVO (SERVIDOR + LOL CLIENT + PARTIDA)
            // ====================================================================
            Panel statusCard = new Panel
            {
                Size = new Size(424, 122),
                Location = new Point(28, 214),
                BackColor = BgCard
            };
            statusCard.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(80, 189, 147, 249), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, statusCard.Width - 1, statusCard.Height - 1);
                }
            };

            lblServerStatus = new Label
            {
                Text = "⚡ Servidor Local: Iniciando na porta 3000...",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = DraculaGreen,
                AutoSize = true,
                Location = new Point(16, 16)
            };

            lblLcuStatus = new Label
            {
                Text = "🔌 Cliente LoL (LCU): Verificando conexão...",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = DraculaFg,
                AutoSize = true,
                Location = new Point(16, 48)
            };

            lblMatchStatus = new Label
            {
                Text = "🎯 Estado: Na Tela Inicial (Home)",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = DraculaComment,
                AutoSize = true,
                Location = new Point(16, 80)
            };

            statusCard.Controls.Add(lblServerStatus);
            statusCard.Controls.Add(lblLcuStatus);
            statusCard.Controls.Add(lblMatchStatus);
            this.Controls.Add(statusCard);

            // ====================================================================
            // 5. BOTÕES DE AÇÃO ESTILO DRACULA NEON
            // ====================================================================
            Button btnOpenMain = CreateActionButton(
                "⚡ ABRIR PAINEL BABILÔNIA COMPLETO",
                new Point(28, 354),
                new Size(424, 50),
                DraculaPurple,
                Color.FromArgb(20, 20, 30),
                11f
            );
            btnOpenMain.Click += (s, e) => OpenAppWindow(false);
            this.Controls.Add(btnOpenMain);

            Button btnOpenMini = CreateActionButton(
                "🪟 ABRIR MINI OVERLAY (SEGUNDA TELA)",
                new Point(28, 416),
                new Size(206, 44),
                BgCard,
                DraculaCyan,
                9f
            );
            btnOpenMini.Click += (s, e) => OpenAppWindow(true);
            this.Controls.Add(btnOpenMini);

            btnToggleSim = CreateActionButton(
                "🎮 SIMULAR PARTIDA: OFF",
                new Point(246, 416),
                new Size(206, 44),
                BgCard,
                DraculaPink,
                9f
            );
            btnToggleSim.Click += (s, e) => ToggleSimulation();
            this.Controls.Add(btnToggleSim);

            Button btnHideTray = CreateActionButton(
                "🔽 Minimizar para a Bandeja (Continua Rodando)",
                new Point(28, 474),
                new Size(424, 40),
                Color.FromArgb(33, 35, 48),
                DraculaComment,
                9f
            );
            btnHideTray.Click += (s, e) => MinimizeToTray();
            this.Controls.Add(btnHideTray);

            Button btnQuitAll = CreateActionButton(
                "🛑 Encerrar Babilônia Completo",
                new Point(28, 526),
                new Size(424, 40),
                Color.FromArgb(55, 28, 36),
                DraculaRed,
                9.5f
            );
            btnQuitAll.Click += (s, e) => ExitApplication();
            this.Controls.Add(btnQuitAll);

            Label lblFooter = new Label
            {
                Text = "Babilônia v2.0 • Sem Voz (Popups Visuais) • API Oficial Local Riot LCU",
                Font = new Font("Segoe UI", 8f, FontStyle.Regular),
                ForeColor = DraculaComment,
                AutoSize = false,
                Size = new Size(424, 22),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(28, 582)
            };
            this.Controls.Add(lblFooter);

            // Borda Neon ao redor da janela
            this.Paint += (s, e) =>
            {
                using (Pen borderPen = new Pen(DraculaPurple, 2))
                {
                    e.Graphics.DrawRectangle(borderPen, 1, 1, this.Width - 2, this.Height - 2);
                }
            };

            // Timer para atualizar o status do servidor e do LoL em tempo real
            statusTimer = new System.Windows.Forms.Timer();
            statusTimer.Interval = 2000;
            statusTimer.Tick += (s, e) => PollBackendStatus();
            statusTimer.Start();
        }

        private Icon LoadAppIcon()
        {
            try
            {
                string icoPath = Path.Combine(appDir, "Babilonia.ico");
                if (File.Exists(icoPath))
                {
                    return new Icon(icoPath);
                }
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
                return SystemIcons.Application;
            }
        }

        private Button CreateHeaderButton(string text, Point location, Color bg, Color fg)
        {
            Button btn = new Button
            {
                Text = text,
                Location = location,
                Size = new Size(34, 28),
                FlatStyle = FlatStyle.Flat,
                BackColor = bg,
                ForeColor = fg,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private Button CreateActionButton(string text, Point location, Size size, Color bg, Color fg, float fontSize)
        {
            Button btn = new Button
            {
                Text = text,
                Location = location,
                Size = size,
                FlatStyle = FlatStyle.Flat,
                BackColor = bg,
                ForeColor = fg,
                Font = new Font("Segoe UI", fontSize, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderColor = Color.FromArgb(90, 189, 147, 249);
            btn.FlatAppearance.BorderSize = 1;
            return btn;
        }

        private void DragWindow_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
            }
        }

        private bool IsBackendOnline()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/state");
                req.Timeout = 900;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private void StartBackendIfNeeded()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                if (!IsBackendOnline())
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = "node",
                            Arguments = "server.js",
                            WorkingDirectory = appDir,
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            WindowStyle = ProcessWindowStyle.Hidden
                        };
                        nodeProcess = Process.Start(psi);
                        Thread.Sleep(1200);
                    }
                    catch (Exception)
                    {
                    }
                }
                this.BeginInvoke((MethodInvoker)delegate
                {
                    PollBackendStatus();
                    OpenAppWindow(false);
                });
            });
        }

        private void PollBackendStatus()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/state");
                    req.Timeout = 1200;
                    using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                    using (StreamReader reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    {
                        string json = reader.ReadToEnd();
                        bool lcuConnected = json.Contains("\"connected\":true");
                        bool simOn = json.Contains("\"isSimulated\":true");
                        bool liveOn = json.Contains("\"inLiveGame\":true");

                        this.BeginInvoke((MethodInvoker)delegate
                        {
                            isSimulated = simOn;
                            lblServerStatus.Text = "🟢 Servidor Babilônia: ONLINE (http://localhost:3000)";
                            lblServerStatus.ForeColor = DraculaGreen;

                            if (lcuConnected)
                            {
                                lblLcuStatus.Text = "⚡ Cliente LoL: CONECTADO AUTOMATICAMENTE";
                                lblLcuStatus.ForeColor = DraculaCyan;
                            }
                            else
                            {
                                lblLcuStatus.Text = "🔌 Cliente LoL: Aguardando abertura do jogo";
                                lblLcuStatus.ForeColor = DraculaFg;
                            }

                            if (liveOn)
                            {
                                lblMatchStatus.Text = "🔥 Partida Ao Vivo Detectada (Monitorando Porta 2999)";
                                lblMatchStatus.ForeColor = DraculaGreen;
                            }
                            else if (simOn)
                            {
                                lblMatchStatus.Text = "🎮 Modo Simulação de Partida Ativo";
                                lblMatchStatus.ForeColor = DraculaPink;
                            }
                            else
                            {
                                lblMatchStatus.Text = "🏠 Modo Real: Pronto na Tela Inicial (Home)";
                                lblMatchStatus.ForeColor = DraculaComment;
                            }

                            btnToggleSim.Text = simOn ? "🎮 SIMULAR PARTIDA: ON" : "🎮 SIMULAR PARTIDA: OFF";
                            btnToggleSim.ForeColor = simOn ? DraculaGreen : DraculaPink;
                        });
                    }
                }
                catch
                {
                    this.BeginInvoke((MethodInvoker)delegate
                    {
                        lblServerStatus.Text = "🔴 Servidor Local: Reconectando...";
                        lblServerStatus.ForeColor = DraculaRed;
                    });
                }
            });
        }

        private void ToggleSimulation()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    bool nextState = !isSimulated;
                    string payload = "{\"enabled\":" + (nextState ? "true" : "false") + ",\"scenario\":\"dragon_gold\"}";
                    byte[] bytes = Encoding.UTF8.GetBytes(payload);

                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/simulate");
                    req.Method = "POST";
                    req.ContentType = "application/json";
                    req.ContentLength = bytes.Length;
                    using (Stream reqStream = req.GetRequestStream())
                    {
                        reqStream.Write(bytes, 0, bytes.Length);
                    }
                    using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) { }
                    PollBackendStatus();
                }
                catch { }
            });
        }

        private void OpenAppWindow(bool compactOverlay)
        {
            string url = "http://localhost:3000";
            try
            {
                // Tenta abrir como janela nativa de aplicativo (sem barra de endereço) via Edge ou Chrome
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                string edgePath64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";

                string browserExe = null;
                if (File.Exists(edgePath)) browserExe = edgePath;
                else if (File.Exists(edgePath64)) browserExe = edgePath64;
                else if (File.Exists(chromePath)) browserExe = chromePath;

                if (browserExe != null)
                {
                    string sizeArg = compactOverlay ? "--window-size=500,840" : "--window-size=1420,900";
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = "--app=" + url + " " + sizeArg,
                        UseShellExecute = true
                    });
                    return;
                }
            }
            catch { }

            // Fallback: navegador padrão
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private void MinimizeToTray()
        {
            this.Hide();
            trayIcon.ShowBalloonTip(
                2500,
                "Babilônia continua ativo!",
                "O ícone do Babilônia continua aqui na barra do sistema monitorando seu LoL.",
                ToolTipIcon.Info
            );
        }

        private void RestoreFromTray()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.Activate();
        }

        private void ExitApplication()
        {
            statusTimer.Stop();
            trayIcon.Visible = false;
            trayIcon.Dispose();

            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try { nodeProcess.Kill(); } catch { }
            }

            Application.Exit();
        }

        [STAThread]
        public static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "BabiloniaLoLCompanionMutex", out createdNew))
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new BabiloniaLauncherForm());
            }
        }
    }
}
