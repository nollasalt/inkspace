// Offline baseline using the handwriting recognizers already installed on Windows.
// Coordinates are supplied by the demo; this helper never captures global input.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Ink;

public sealed class SamplePoint { public double x; public double y; }
public sealed class SampleStroke { public List<SamplePoint> points; }
public sealed class Request { public string operation; public string recognizer; public List<SampleStroke> strokes; }
public static class WindowsText {
    [STAThread]
    public static void Main() {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        var json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };
        try {
            var request = json.Deserialize<Request>(Console.In.ReadToEnd());
            {
                var recognizers = new Recognizers();
                var available = new List<string>();
                Recognizer chosen = null;
                foreach (Recognizer r in recognizers) {
                    if (r.Languages.Length == 0) continue;
                    available.Add(r.Name);
                    if (r.Name == request.recognizer) chosen = r;
                }
                if (request.operation == "status") {
                    Console.Write(json.Serialize(new { recognizers = available })); return;
                }
                if (chosen == null) throw new Exception("未找到所选 Windows 手写识别器");
                if (request.strokes == null || request.strokes.Count == 0 || request.strokes.Count > 2000) throw new Exception("需要有效的笔画输入");
                double minX = double.MaxValue, minY = double.MaxValue;
                int total = 0;
                foreach (var s in request.strokes) {
                    if (s.points == null || s.points.Count == 0) throw new Exception("存在空笔画");
                    total += s.points.Count;
                    foreach (var p in s.points) {
                        if (double.IsNaN(p.x) || double.IsNaN(p.y) || double.IsInfinity(p.x) || double.IsInfinity(p.y) || Math.Abs(p.x) > 20000 || Math.Abs(p.y) > 20000) throw new Exception("坐标无效");
                        minX = Math.Min(minX, p.x); minY = Math.Min(minY, p.y);
                    }
                }
                if (total > 200000) throw new Exception("采样点过多");
                using (var ink = new Ink()) {
                    // Microsoft.Ink uses HIMETRIC (0.01 mm); input uses CSS px at 96 dpi.
                    const double factor = 2540.0 / 96.0;
                    foreach (var s in request.strokes) {
                        var points = new Point[Math.Max(2, s.points.Count)];
                        for (int i = 0; i < points.Length; i++) {
                            var p = s.points[Math.Min(i, s.points.Count - 1)];
                            points[i] = new Point((int)Math.Round((p.x - minX + 10) * factor), (int)Math.Round((p.y - minY + 10) * factor));
                        }
                        ink.CreateStroke(points);
                    }
                    using (var context = chosen.CreateRecognizerContext()) {
                        context.Strokes = ink.Strokes;
                        RecognitionStatus status;
                        var timer = Stopwatch.StartNew();
                        var result = context.Recognize(out status);
                        timer.Stop();
                        if (status != RecognitionStatus.NoError || result == null) throw new Exception("Windows 识别失败：" + status);
                        var alternatives = new List<string>();
                        foreach (RecognitionAlternate alt in result.GetAlternatesFromSelection()) {
                            if (!alternatives.Contains(alt.ToString())) alternatives.Add(alt.ToString());
                            if (alternatives.Count == 8) break;
                        }
                        Console.Write(json.Serialize(new { text = result.TopString, alternatives = alternatives, engineMs = timer.Elapsed.TotalMilliseconds,
                            recognizer = chosen.Name, confidence = (object)null }));
                    }
                }
            }
        } catch (Exception error) {
            Console.Write(json.Serialize(new { error = error.Message })); Environment.ExitCode = 1;
        }
    }
}
