import { execFile } from 'child_process'
import { app, ipcMain, shell } from 'electron'
import { basename, join, parse } from 'path'
import { promisify } from 'util'
import { copyFile, mkdir, writeFile } from 'fs/promises'

type ShareFilePayload = {
  buffer: number[] | ArrayBuffer | Uint8Array
  filename: string
  mimeType?: string
}

type ShareFileResult = {
  success: boolean
  shared: boolean
  path?: string
  fallback?: 'downloads' | 'downloads-revealed'
  error?: string
}

const execFileAsync = promisify(execFile)
const WINDOWS_SHARE_HELPER_SOURCE = `
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Windows.Forms;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;
using Windows.Storage;

[ComImport]
[Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDataTransferManagerInterop
{
    IntPtr GetForWindow(IntPtr appWindow, ref Guid riid);
    void ShowShareUIForWindow(IntPtr appWindow);
}

public sealed class ShareBridgeForm : Form
{
    private static readonly Guid DataTransferManagerIid =
        new Guid(0xa5caee9b, 0x8708, 0x49d1, 0x8d, 0x36, 0x67, 0xd2, 0x5a, 0x8d, 0xa0, 0x0c);

    private readonly string _filePath;
    private readonly string _title;
    private readonly Timer _fallbackCloseTimer;

    private DataTransferManager _dataTransferManager;
    private TypedEventHandler<DataTransferManager, DataRequestedEventArgs> _dataRequestedHandler;

    public string FailureMessage { get; private set; }

    public ShareBridgeForm(string filePath, string title)
    {
        _filePath = filePath;
        _title = title;

        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        Size = new Size(1, 1);
        Opacity = 0;

        _fallbackCloseTimer = new Timer();
        _fallbackCloseTimer.Interval = 10000;
        _fallbackCloseTimer.Tick += (sender, args) =>
        {
            _fallbackCloseTimer.Stop();
            Close();
        };
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        BeginInvoke((Action)ShowShareUi);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _fallbackCloseTimer.Stop();
        _fallbackCloseTimer.Dispose();

        if (_dataTransferManager != null && _dataRequestedHandler != null)
        {
            _dataTransferManager.DataRequested -= _dataRequestedHandler;
        }

        base.OnFormClosed(e);
    }

    private void ShowShareUi()
    {
        try
        {
            var interop = (IDataTransferManagerInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(DataTransferManager));
            var managerPointer = interop.GetForWindow(Handle, ref DataTransferManagerIid);
            if (managerPointer == IntPtr.Zero)
            {
                throw new InvalidOperationException("Unable to access the Windows share manager.");
            }

            _dataTransferManager = MarshalInterface<DataTransferManager>.FromAbi(managerPointer);
            var file = StorageFile.GetFileFromPathAsync(_filePath).AsTask().GetAwaiter().GetResult();

            _dataRequestedHandler = (sender, args) =>
            {
                var request = args.Request;
                request.Data.Properties.Title = string.IsNullOrWhiteSpace(_title) ? file.Name : _title;
                request.Data.Properties.Description = file.Name;
                request.Data.SetStorageItems(new[] { file });
                request.Data.RequestedOperation = DataPackageOperation.Copy;
                StartCloseTimer(1200);
            };

            _dataTransferManager.DataRequested += _dataRequestedHandler;
            _fallbackCloseTimer.Start();
            interop.ShowShareUIForWindow(Handle);
        }
        catch (Exception ex)
        {
            FailureMessage = ex.Message;
            Close();
        }
    }

    private void StartCloseTimer(int intervalMilliseconds)
    {
        var closeTimer = new Timer();
        closeTimer.Interval = intervalMilliseconds;
        closeTimer.Tick += (sender, args) =>
        {
            closeTimer.Stop();
            closeTimer.Dispose();
            Close();
        };
        closeTimer.Start();
    }
}

public static class WindowsShareLauncher
{
    public static void ShowFileShare(string filePath, string title)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            throw new ArgumentException("File path is required.", "filePath");
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        using (var form = new ShareBridgeForm(filePath, title))
        {
            Application.Run(form);

            if (!string.IsNullOrWhiteSpace(form.FailureMessage))
            {
                throw new InvalidOperationException(form.FailureMessage);
            }
        }
    }
}
`

export function registerShareIpc() {
  ipcMain.handle('share:file', async (_event, payload: ShareFilePayload): Promise<ShareFileResult> => {
    const filename = sanitizeFileName(payload.filename)
    const tempPath = await writeTempFile(payload.buffer, filename)

    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      const downloadPath = await saveToDownloads(tempPath, filename)
      await revealSavedFile(downloadPath)
      return { success: true, shared: false, fallback: 'downloads-revealed', path: downloadPath }
    }

    try {
      if (process.platform === 'darwin') {
        await shareWithMacOs(tempPath)
      } else {
        await shareWithWindows(tempPath, filename)
      }

      return { success: true, shared: true, path: tempPath }
    } catch (error) {
      console.warn('[share:file] native share unavailable, falling back to downloads', {
        platform: process.platform,
        error: error instanceof Error ? error.message : String(error),
      })

      const downloadPath = await saveToDownloads(tempPath, filename)
      await revealSavedFile(downloadPath)

      return {
        success: true,
        shared: false,
        fallback: 'downloads-revealed',
        path: downloadPath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

function sanitizeFileName(filename: string) {
  const cleaned = basename(filename || 'receipt.pdf')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()

  const safeName = cleaned || 'receipt.pdf'
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function toBuffer(buffer: ShareFilePayload['buffer']) {
  if (Array.isArray(buffer)) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof Uint8Array) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer)
  }

  throw new Error('Unsupported share buffer payload.')
}

async function writeTempFile(buffer: ShareFilePayload['buffer'], filename: string) {
  const tempDir = join(app.getPath('temp'), 'biztrack-receipts')
  await mkdir(tempDir, { recursive: true })

  const tempPath = await uniqueFilePath(tempDir, filename)
  await writeFile(tempPath, toBuffer(buffer))

  return tempPath
}

async function saveToDownloads(sourcePath: string, filename: string) {
  const downloadsDir = app.getPath('downloads')
  await mkdir(downloadsDir, { recursive: true })

  const downloadPath = await uniqueFilePath(downloadsDir, filename)
  await copyFile(sourcePath, downloadPath)

  return downloadPath
}

async function revealSavedFile(filePath: string) {
  try {
    shell.showItemInFolder(filePath)
  } catch {
    await shell.openPath(filePath)
  }
}

async function uniqueFilePath(directory: string, filename: string) {
  const parsed = parse(filename)
  const extension = parsed.ext || '.pdf'
  const baseName = parsed.name || 'receipt'

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = join(directory, `${baseName}${suffix}${extension}`)

    try {
      await writeFile(candidate, '', { flag: 'wx' })
      return candidate
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error
      }
    }
  }

  throw new Error('Unable to create a unique receipt file name.')
}

function isFileAlreadyExistsError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}

async function shareWithMacOs(filePath: string) {
  const script = `
ObjC.import('AppKit')
const filePath = $.NSString.alloc.initWithUTF8String(${JSON.stringify(filePath)})
const fileUrl = $.NSURL.fileURLWithPath(filePath)
const picker = $.NSSharingServicePicker.alloc.initWithItems([fileUrl])
const app = $.NSApplication.sharedApplication
app.activateIgnoringOtherApps(true)
const rect = $.NSMakeRect(0, 0, 1, 1)
const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
  rect,
  $.NSWindowStyleMaskBorderless,
  $.NSBackingStoreBuffered,
  false
)
window.makeKeyAndOrderFront(null)
picker.showRelativeToRectOfViewPreferredEdge(rect, window.contentView, $.NSMinYEdge)
$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(2))
`

  await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5_000 })
}

async function shareWithWindows(filePath: string, filename: string) {
  const script = buildWindowsShareScript(filePath, filename)

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      timeout: 20_000,
      windowsHide: true,
    },
  )
}

function buildWindowsShareScript(filePath: string, filename: string) {
  return `
$filePath = ${toPowerShellString(filePath)}
$title = ${toPowerShellString(filename)}
$windowsMetadataCandidates = @(
  (Join-Path ${'$'}{env:ProgramFiles(x86)} 'Windows Kits\\10\\UnionMetadata\\Facade\\Windows.winmd'),
  (Join-Path ${'$'}env:ProgramFiles 'Windows Kits\\10\\UnionMetadata\\Facade\\Windows.winmd')
) | Where-Object { ${'$'}_ -and (Test-Path ${'$'}_) }

$windowsWinMd = ${'$'}windowsMetadataCandidates | Select-Object -First 1
if (-not ${'$'}windowsWinMd) {
  throw 'Windows metadata not found for native share.'
}

$source = @"
${WINDOWS_SHARE_HELPER_SOURCE}
"@

if (-not ('WindowsShareLauncher' -as [type])) {
  Add-Type -TypeDefinition ${'$'}source -ReferencedAssemblies @(
    'System.Runtime.WindowsRuntime',
    'System.Windows.Forms',
    'System.Drawing',
    ${'$'}windowsWinMd
  )
}

[WindowsShareLauncher]::ShowFileShare(${'$'}filePath, ${'$'}title)
`
}

function toPowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
