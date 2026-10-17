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
    /// Janela pequena que fica por cima do jogo durante a partida mostrando o próximo item
    /// a comprar e a habilidade a upar. Só mostra informação: os cliques passam direto para
    /// o jogo e ela nunca aperta teclas.
    /// </summary>
    public class BabiloniaOverlayForm : Form
    {
        private const string OverlayUrl = "http://127.0.0.1:3000/api/overlay";

        private static readonly Color BgCard = Color.FromArgb(24, 25, 34);
        private static readonly Color Orange = Color.FromArgb(255, 184, 108);
        private static readonly Color Green = Color.FromArgb(80, 250, 123);
        private static readonly Color Fg = Color.FromArgb(248, 248, 242);
        private static readonly Color Muted = Color.FromArgb(148, 163, 204);

        private readonly PictureBox itemIcon;
        private readonly Label itemTag;
        private readonly Label itemName;
        private readonly Label itemGold;
        private readonly Label skillKey;
        private readonly Label skillTitle;
        private readonly Label skillSub;
        private readonly Panel itemPanel;
        private readonly Panel skillPanel;

        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>();
        private System.Threading.Timer pollTimer;
        private DateTime lastServerOk = DateTime.Now;
        private string ddragonVersion = "";
        private string currentIconId = "";
        private string currentCorner = "";
        private int polling = 0;

        public BabiloniaOverlayForm()
        {
            Text = "Babilonia Buff Overlay";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = BgCard;
            Opacity = 0.9;
            Size = new Size(330, 186);

            itemPanel = new Panel { Location = new Point(0, 0), Size = new Size(330, 100), BackColor = BgCard };
            itemIcon = new PictureBox { Location = new Point(12, 12), Size = new Size(60, 60), SizeMode = PictureBoxSizeMode.StretchImage, BackColor = Color.FromArgb(40, 42, 54) };
            itemTag = MakeLabel("PRÓXIMA COMPRA", new Point(82, 10), 8.5f, FontStyle.Bold, Orange);
            itemName = MakeLabel("", new Point(82, 28), 12f, FontStyle.Bold, Fg);
            itemGold = MakeLabel("", new Point(82, 54), 9.5f, FontStyle.Regular, Muted);
            itemName.AutoSize = false;
            itemName.Size = new Size(240, 24);
            itemName.AutoEllipsis = true;
            itemGold.AutoSize = false;
            itemGold.Size = new Size(240, 40);
            itemPanel.Controls.AddRange(new Control[] { itemIcon, itemTag, itemName, itemGold });

            skillPanel = new Panel { Location = new Point(0, 102), Size = new Size(330, 84), BackColor = BgCard };
            skillKey = new Label
            {
                Location = new Point(12, 12),
                Size = new Size(60, 60),
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 28f, FontStyle.Bold),
                BackColor = Orange,
                ForeColor = Color.FromArgb(25, 26, 33)
            };
            skillTitle = MakeLabel("", new Point(82, 18), 13f, FontStyle.Bold, Fg);
            skillSub = MakeLabel("", new Point(82, 46), 9.5f, FontStyle.Regular, Muted);
            skillPanel.Controls.AddRange(new Control[] { skillKey, skillTitle, skillSub });

            Controls.Add(itemPanel);
            Controls.Add(skillPanel);
            Visible = false;
        }

        private static Label MakeLabel(string text, Point loc, float size, FontStyle style, Color color)
        {
            return new Label
            {
                Text = text,
                Location = loc,
                AutoSize = true,
                Font = new Font("Segoe UI", size, style),
                ForeColor = color,
                BackColor = Color.Transparent
            };
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
                {
                    BeginInvoke((MethodInvoker)delegate { Application.Exit(); });
                }
                else
                {
                    BeginInvoke((MethodInvoker)delegate { if (Visible) Hide(); });
                }
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
                if (Visible) Hide();
                return;
            }

            if (showItem)
            {
                if (icon != null)
                {
                    itemIcon.Image = icon;
                    currentIconId = itemId;
                }
                int cost, gold;
                int.TryParse(Get(d, "itemCost"), out cost);
                int.TryParse(Get(d, "gold"), out gold);
                itemName.Text = Get(d, "itemName");
                string big = Get(d, "bigItemName");
                bool canBuy = cost > 0 && gold >= cost;
                itemTag.Text = canBuy ? "PODE COMPRAR AGORA" : "PRÓXIMA COMPRA";
                itemTag.ForeColor = canBuy ? Green : Orange;
                itemGold.Text = (cost > 0 ? cost + "g" : "") + "  •  você tem " + gold + "g" +
                    (big != "" && big != itemName.Text ? "\npara " + big : "");
                itemGold.ForeColor = canBuy ? Green : Muted;
            }

            if (showSkill)
            {
                string key = Get(d, "skill");
                int pending, level;
                int.TryParse(Get(d, "skillPending"), out pending);
                int.TryParse(Get(d, "level"), out level);
                skillKey.Text = key;
                if (pending > 0)
                {
                    skillKey.BackColor = Orange;
                    skillTitle.Text = "UPE " + key + " AGORA";
                    skillTitle.ForeColor = Orange;
                    skillSub.Text = "Nível " + level + (pending > 1 ? " • " + pending + " pontos sobrando" : "");
                }
                else
                {
                    skillKey.BackColor = Color.FromArgb(68, 71, 90);
                    skillTitle.Text = "Próximo nível: " + key;
                    skillTitle.ForeColor = Fg;
                    skillSub.Text = "Você está no nível " + level;
                }
            }

            itemPanel.Visible = showItem;
            skillPanel.Visible = showSkill;
            skillPanel.Top = showItem ? 102 : 0;
            Height = (showItem ? 100 : 0) + (showSkill ? 84 : 0) + (showItem && showSkill ? 2 : 0);

            string corner = Get(d, "corner");
            if (corner != currentCorner || !Visible) PlaceAt(corner);
            if (!Visible) Show();
        }

        private void PlaceAt(string corner)
        {
            currentCorner = corner;
            Rectangle area = Screen.PrimaryScreen.Bounds;
            int margin = 16;
            int x = corner.EndsWith("left") ? area.Left + margin : area.Right - Width - margin;
            int y = corner.StartsWith("top") ? area.Top + 90 : area.Top + (int)(area.Height * 0.32);
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
                bool exists;
                using (var m = Mutex.OpenExisting("BabiloniaBuffOverlayMutex")) { exists = true; }
                if (exists) return;
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
