using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BabiloniaApp
{
    /// <summary>
    /// Cartão pequeno por cima do jogo com o próximo item e a habilidade a upar. Aparece só
    /// quando algo muda (item novo, dá para comprar, ponto de habilidade para gastar) e some
    /// sozinho depois de alguns segundos. Só mostra informação: os cliques passam direto para
    /// o jogo e ele nunca aperta teclas.
    /// </summary>
    public class BabiloniaOverlayForm : Form
    {
        private const string OverlayUrl = "http://127.0.0.1:3000/api/overlay";

        private static readonly Color BgCard = Color.FromArgb(24, 25, 34);
        private static readonly Color Orange = Color.FromArgb(255, 184, 108);
        private static readonly Color Green = Color.FromArgb(80, 250, 123);
        private static readonly Color Fg = Color.FromArgb(248, 248, 242);
        private static readonly Color Muted = Color.FromArgb(148, 163, 204);
        private static readonly Color KeyIdle = Color.FromArgb(68, 71, 90);

        private readonly PictureBox itemIcon;
        private readonly Label itemName;
        private readonly Label itemGold;
        private readonly Label skillKey;

        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>();
        private System.Threading.Timer pollTimer;
        private DateTime lastServerOk = DateTime.Now;
        private DateTime hideAt = DateTime.MinValue;
        private string ddragonVersion = "";
        private string currentIconId = "";
        private string lastSignature = "";
        private string layoutKey = "";
        private int polling = 0;

        public BabiloniaOverlayForm()
        {
            Text = "Babilonia Buff Overlay";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = BgCard;
            Opacity = 0.88;

            itemIcon = new PictureBox { SizeMode = PictureBoxSizeMode.StretchImage, BackColor = Color.FromArgb(40, 42, 54) };
            itemName = new Label { AutoSize = false, AutoEllipsis = true, ForeColor = Fg, BackColor = Color.Transparent };
            itemGold = new Label { AutoSize = false, AutoEllipsis = true, ForeColor = Muted, BackColor = Color.Transparent };
            skillKey = new Label { AutoSize = false, TextAlign = ContentAlignment.MiddleCenter, BackColor = KeyIdle, ForeColor = Color.FromArgb(25, 26, 33) };

            Controls.AddRange(new Control[] { itemIcon, itemName, itemGold, skillKey });
            ApplyLayout(1f, true, true);
            Visible = false;
        }

        // Tamanho "small" (padrão) ou "medium": tudo escala junto
        private void ApplyLayout(float scale, bool showItem, bool showSkill)
        {
            Func<int, int> s = v => (int)Math.Round(v * scale);
            int pad = s(6);
            int icon = s(36);
            int x = pad;

            itemIcon.Visible = itemName.Visible = itemGold.Visible = showItem;
            skillKey.Visible = showSkill;

            if (showItem)
            {
                itemIcon.SetBounds(x, pad, icon, icon);
                itemName.SetBounds(x + icon + s(6), pad - s(1), s(150), s(19));
                itemGold.SetBounds(x + icon + s(6), pad + s(18), s(150), s(17));
                itemName.Font = new Font("Segoe UI", 9.5f * scale, FontStyle.Bold);
                itemGold.Font = new Font("Segoe UI", 8f * scale, FontStyle.Regular);
                x += icon + s(6) + s(150) + s(4);
            }
            if (showSkill)
            {
                skillKey.SetBounds(x, pad, icon, icon);
                skillKey.Font = new Font("Segoe UI", 17f * scale, FontStyle.Bold);
                x += icon;
            }
            Size = new Size(x + pad, icon + pad * 2);
        }

        // Clique atravessa a janela, ela não rouba o foco do jogo e não aparece no Alt+Tab
        protected override CreateParams CreateParams
        {
            get
            {
                const int WS_EX_LAYERED = 0x80000;
                const int WS_EX_TRANSPARENT = 0x20;
                const int WS_EX_TOOLWINDOW = 0x80;
                const int WS_EX_NOACTIVATE = 0x08000000;
                const int WS_EX_TOPMOST = 0x8;
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST;
                return cp;
            }
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            Hide();
            pollTimer = new System.Threading.Timer(_ => Poll(), null, 500, 1000);
        }

        private void Poll()
        {
            if (Interlocked.Exchange(ref polling, 1) == 1) return;
            try
            {
                string text;
                using (var wc = new WebClient())
                {
                    wc.Encoding = Encoding.UTF8;
                    text = wc.DownloadString(OverlayUrl);
                }
                lastServerOk = DateTime.Now;
                var data = Parse(text);
                Image icon = null;
                string itemId = Get(data, "itemId");
                if (itemId != "" && itemId != currentIconId) icon = LoadItemIcon(itemId);
                BeginInvoke((MethodInvoker)delegate { Apply(data, itemId, icon); });
            }
            catch
            {
                // Servidor fechado há mais de 10 minutos: o app foi encerrado, então a janela também fecha
                if ((DateTime.Now - lastServerOk).TotalMinutes > 10)
                    BeginInvoke((MethodInvoker)delegate { Application.Exit(); });
                else
                    BeginInvoke((MethodInvoker)delegate { if (Visible) Hide(); });
            }
            finally
            {
                Interlocked.Exchange(ref polling, 0);
            }
        }

        private static Dictionary<string, string> Parse(string text)
        {
            var d = new Dictionary<string, string>();
            foreach (var line in text.Split('\n'))
            {
                int i = line.IndexOf('=');
                if (i > 0) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
            }
            return d;
        }

        private static string Get(Dictionary<string, string> d, string k)
        {
            string v;
            return d.TryGetValue(k, out v) ? v : "";
        }

        private Image LoadItemIcon(string itemId)
        {
            lock (iconCache)
            {
                Image cached;
                if (iconCache.TryGetValue(itemId, out cached)) return cached;
            }
            try
            {
                using (var wc = new WebClient())
                {
                    if (ddragonVersion == "")
                    {
                        string versions = wc.DownloadString("https://ddragon.leagueoflegends.com/api/versions.json");
                        int a = versions.IndexOf('"');
                        int b = versions.IndexOf('"', a + 1);
                        ddragonVersion = versions.Substring(a + 1, b - a - 1);
                    }
                    byte[] bytes = wc.DownloadData("https://ddragon.leagueoflegends.com/cdn/" + ddragonVersion + "/img/item/" + itemId + ".png");
                    Image img = Image.FromStream(new MemoryStream(bytes));
                    lock (iconCache) iconCache[itemId] = img;
                    return img;
                }
            }
            catch
            {
                return null;
            }
        }

        private void Apply(Dictionary<string, string> d, string itemId, Image icon)
        {
            bool active = Get(d, "active") == "1";
            bool showItem = Get(d, "showItem") == "1" && itemId != "";
            bool showSkill = Get(d, "showSkill") == "1" && Get(d, "skill") != "";
            if (!active || (!showItem && !showSkill))
            {
                lastSignature = "";
                if (Visible) Hide();
                return;
            }

            int cost, gold, pending, seconds;
            int.TryParse(Get(d, "itemCost"), out cost);
            int.TryParse(Get(d, "gold"), out gold);
            int.TryParse(Get(d, "skillPending"), out pending);
            if (!int.TryParse(Get(d, "seconds"), out seconds)) seconds = 5;
            bool canBuy = cost > 0 && gold >= cost;
            string key = Get(d, "skill");

            float scale = Get(d, "size") == "medium" ? 1.35f : 1f;
            string newLayout = scale + "|" + showItem + "|" + showSkill + "|" + Get(d, "corner");
            if (newLayout != layoutKey)
            {
                layoutKey = newLayout;
                ApplyLayout(scale, showItem, showSkill);
                PlaceAt(Get(d, "corner"));
            }

            if (showItem)
            {
                if (icon != null)
                {
                    itemIcon.Image = icon;
                    currentIconId = itemId;
                }
                itemName.Text = Get(d, "itemName");
                itemGold.Text = canBuy ? "Pode comprar (" + cost + "g)" : cost + "g • você tem " + gold + "g";
                itemGold.ForeColor = canBuy ? Green : Muted;
            }
            if (showSkill)
            {
                skillKey.Text = key;
                skillKey.BackColor = pending > 0 ? Orange : KeyIdle;
                skillKey.ForeColor = pending > 0 ? Color.FromArgb(25, 26, 33) : Fg;
            }

            // Só aparece quando algo muda e some sozinho depois de alguns segundos (0 = fica sempre)
            string signature = (showItem ? itemId + "|" + canBuy : "") + "|" + (showSkill ? key + "|" + (pending > 0) : "");
            if (signature != lastSignature)
            {
                lastSignature = signature;
                hideAt = seconds <= 0 ? DateTime.MaxValue : DateTime.Now.AddSeconds(seconds);
            }

            bool shouldShow = DateTime.Now < hideAt;
            if (shouldShow && !Visible) Show();
            else if (!shouldShow && Visible) Hide();
        }

        private void PlaceAt(string corner)
        {
            Rectangle area = Screen.PrimaryScreen.Bounds;
            int margin = 12;
            int x = corner.EndsWith("left") ? area.Left + margin : area.Right - Width - margin;
            int y = corner.StartsWith("top") ? area.Top + 70 : area.Top + (int)(area.Height * 0.36);
            Location = new Point(x, y);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (pollTimer != null) pollTimer.Dispose();
            base.OnFormClosed(e);
        }

        /// <summary>Abre a janela por cima do jogo em um processo próprio, se ainda não estiver aberta.</summary>
        public static void StartDetached()
        {
            try
            {
                using (Mutex.OpenExisting("BabiloniaBuffOverlayMutex")) { }
                return; // já está aberta
            }
            catch (WaitHandleCannotBeOpenedException) { }
            catch { return; }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = Application.ExecutablePath,
                    Arguments = "--overlay",
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetDirectoryName(Application.ExecutablePath)
                });
            }
            catch { }
        }

        public static void RunOverlay()
        {
            bool createdNew;
            using (var mutex = new Mutex(true, "BabiloniaBuffOverlayMutex", out createdNew))
            {
                if (!createdNew) return;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new BabiloniaOverlayForm());
            }
        }
    }
}
