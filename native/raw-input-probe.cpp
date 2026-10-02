// Independent diagnostic: no hooks, host modifications, or device write access.
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <hidsdi.h>
#include <hidpi.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>
#include <map>
#include <set>
#include <optional>
#include <chrono>
#include <algorithm>
#include <iostream>

namespace fs=std::filesystem;
struct Device {
  unsigned long long identity=0;USHORT page=0,usage=0;std::vector<BYTE> preparsed;
  std::vector<HIDP_VALUE_CAPS> values;std::vector<HIDP_BUTTON_CAPS> buttons;
  bool pen=false;std::optional<bool> contact;
};
static std::map<HANDLE,Device> devices;
static fs::path output;static std::ofstream events;
static HWND receiver;static unsigned duration=300;
static ULONGLONG started;static bool show=false,running=true,stream=false;
static unsigned long long messages=0,reports=0,penReports=0,backgroundPenReports=0,completeReports=0,backgroundCompleteReports=0,downs=0,ups=0,logged=0,decodeErrors=0;
static std::optional<long long> pressureMin,pressureMax;
static std::vector<std::pair<std::pair<USHORT,USHORT>,DWORD>> registrations;
static std::string hex(unsigned value){std::ostringstream s;s<<"0x"<<std::hex<<value;return s.str();}
static std::string number(std::optional<long long> value){return value?std::to_string(*value):"null";}
static PHIDP_PREPARSED_DATA pp(Device& d){return reinterpret_cast<PHIDP_PREPARSED_DATA>(d.preparsed.data());}
static bool includes(const HIDP_VALUE_CAPS& c,USHORT usage){return c.IsRange?usage>=c.Range.UsageMin&&usage<=c.Range.UsageMax:usage==c.NotRange.Usage;}
static bool includes(const HIDP_BUTTON_CAPS& c,USHORT usage){return c.IsRange?usage>=c.Range.UsageMin&&usage<=c.Range.UsageMax:usage==c.NotRange.Usage;}
static Device inspect(HANDLE handle){
  Device d;RID_DEVICE_INFO info{};info.cbSize=sizeof(info);UINT bytes=sizeof(info);
  if(GetRawInputDeviceInfoW(handle,RIDI_DEVICEINFO,&info,&bytes)==UINT(-1)||info.dwType!=RIM_TYPEHID)return d;
  UINT nameSize=0;GetRawInputDeviceInfoW(handle,RIDI_DEVICENAME,nullptr,&nameSize);std::vector<wchar_t> name(nameSize+1);if(nameSize&&GetRawInputDeviceInfoW(handle,RIDI_DEVICENAME,name.data(),&nameSize)!=UINT(-1)){d.identity=14695981039346656037ull;for(UINT i=0;i<nameSize&&name[i];i++){d.identity^=static_cast<unsigned short>(name[i]);d.identity*=1099511628211ull;}}
  d.page=info.hid.usUsagePage;d.usage=info.hid.usUsage;
  bytes=0;if(GetRawInputDeviceInfoW(handle,RIDI_PREPARSEDDATA,nullptr,&bytes)==UINT(-1)||!bytes)return d;
  d.preparsed.resize(bytes);if(GetRawInputDeviceInfoW(handle,RIDI_PREPARSEDDATA,d.preparsed.data(),&bytes)==UINT(-1)){d.preparsed.clear();return d;}
  HIDP_CAPS caps{};if(HidP_GetCaps(pp(d),&caps)!=HIDP_STATUS_SUCCESS){d.preparsed.clear();return d;}
  USHORT count=caps.NumberInputValueCaps;d.values.resize(count);
  if(count&&HidP_GetValueCaps(HidP_Input,d.values.data(),&count,pp(d))==HIDP_STATUS_SUCCESS)d.values.resize(count);else d.values.clear();
  count=caps.NumberInputButtonCaps;d.buttons.resize(count);
  if(count&&HidP_GetButtonCaps(HidP_Input,d.buttons.data(),&count,pp(d))==HIDP_STATUS_SUCCESS)d.buttons.resize(count);else d.buttons.clear();
  d.pen=d.page==0x0d&&(d.usage==1||d.usage==2);
  // Vendor-defined top-level collections are candidates only if they expose pen pressure.
  if(d.page>=0xff00)for(const auto& v:d.values)if(v.UsagePage==0x0d&&includes(v,0x30))d.pen=true;
  return d;
}
static void inventory(){
  UINT count=0;if(GetRawInputDeviceList(nullptr,&count,sizeof(RAWINPUTDEVICELIST))==UINT(-1))return;
  std::vector<RAWINPUTDEVICELIST> list(count);UINT n=GetRawInputDeviceList(list.data(),&count,sizeof(RAWINPUTDEVICELIST));if(n==UINT(-1))return;
  std::map<HANDLE,Device> next;for(UINT i=0;i<n;i++)if(list[i].dwType==RIM_TYPEHID){auto d=inspect(list[i].hDevice);auto previous=devices.find(list[i].hDevice);if(previous!=devices.end())d.contact=previous->second.contact;next.emplace(list[i].hDevice,std::move(d));}devices=std::move(next);
}
static void registerDevices(){
  std::set<std::pair<USHORT,USHORT>> usages{{0x0d,1},{0x0d,2}};
  for(const auto& [handle,d]:devices)if(d.pen)usages.emplace(d.page,d.usage);
  registrations.clear();for(auto [page,usage]:usages){RAWINPUTDEVICE r{page,usage,RIDEV_INPUTSINK|RIDEV_DEVNOTIFY,receiver};BOOL ok=RegisterRawInputDevices(&r,1,sizeof(r));registrations.push_back({{page,usage},ok?0:GetLastError()});}
}
static std::optional<long long> value(Device& d,USHORT page,USHORT usage,char* report,ULONG length){
  for(const auto& c:d.values)if(c.UsagePage==page&&includes(c,usage)){
    ULONG v=0;if(HidP_GetUsageValue(HidP_Input,page,c.LinkCollection,usage,&v,pp(d),report,length)==HIDP_STATUS_SUCCESS){
      if(c.LogicalMin<0&&c.BitSize>0&&c.BitSize<32&&(v&(1u<<(c.BitSize-1))))return static_cast<long long>(v)-(1ll<<c.BitSize);
      return v;
    }
  }return {};
}
static std::optional<bool> button(Device& d,USHORT usage,char* report,ULONG length){
  for(const auto& c:d.buttons)if(c.UsagePage==0x0d&&includes(c,usage)){
    ULONG count=HidP_MaxUsageListLength(HidP_Input,0x0d,pp(d));if(!count||count>4096)continue;
    std::vector<USAGE> pressed(count);if(HidP_GetUsages(HidP_Input,0x0d,c.LinkCollection,pressed.data(),&count,pp(d),report,length)==HIDP_STATUS_SUCCESS)return std::find(pressed.begin(),pressed.begin()+count,usage)!=pressed.begin()+count;
  }
  auto v=value(d,0x0d,usage,report,length);return v?std::optional<bool>(*v!=0):std::nullopt;
}
static void receive(HRAWINPUT handle,WPARAM code){
  UINT size=0;if(GetRawInputData(handle,RID_INPUT,nullptr,&size,sizeof(RAWINPUTHEADER))==UINT(-1))return;
  std::vector<BYTE> buffer(size);if(GetRawInputData(handle,RID_INPUT,buffer.data(),&size,sizeof(RAWINPUTHEADER))==UINT(-1))return;
  ++messages;const auto* raw=reinterpret_cast<const RAWINPUT*>(buffer.data());if(raw->header.dwType!=RIM_TYPEHID)return;
  auto found=devices.find(raw->header.hDevice);if(found==devices.end())found=devices.emplace(raw->header.hDevice,inspect(raw->header.hDevice)).first;
  auto& d=found->second;const auto& hid=raw->data.hid;
  const size_t offset=reinterpret_cast<const BYTE*>(hid.bRawData)-buffer.data();
  if(offset>buffer.size()||!hid.dwSizeHid||hid.dwCount>(buffer.size()-offset)/hid.dwSizeHid){++decodeErrors;return;}
  const bool background=GET_RAWINPUT_CODE_WPARAM(code)==RIM_INPUTSINK;
  for(DWORD i=0;i<hid.dwCount;i++){
    ++reports;if(!d.pen)continue;++penReports;if(background)++backgroundPenReports;
    if(d.preparsed.empty()){++decodeErrors;continue;}
    char* data=reinterpret_cast<char*>(const_cast<BYTE*>(hid.bRawData))+size_t(i)*hid.dwSizeHid;
    auto x=value(d,1,0x30,data,hid.dwSizeHid),y=value(d,1,0x31,data,hid.dwSizeHid),pressure=value(d,0x0d,0x30,data,hid.dwSizeHid);
    auto contact=button(d,0x42,data,hid.dwSizeHid),range=button(d,0x32,data,hid.dwSizeHid);
    if(stream&&x&&y&&pressure){
      long maxPressure=0;for(const auto& v:d.values)if(v.UsagePage==0x0d&&includes(v,0x30))maxPressure=std::max(maxPressure,v.LogicalMax);
      std::cout<<"{\"device\":"<<reinterpret_cast<uintptr_t>(raw->header.hDevice)<<",\"deviceKey\":\""<<d.identity<<"\",\"x\":"<<*x<<",\"y\":"<<*y<<",\"pressure\":"<<*pressure<<",\"pressureMax\":"<<maxPressure<<",\"contact\":"<<(contact?(*contact?"true":"false"):"null")<<",\"inRange\":"<<(range?(*range?"true":"false"):"null")<<",\"background\":"<<(background?"true":"false")<<"}\n";std::cout.flush();
    }
    if(x&&y&&pressure){++completeReports;if(background)++backgroundCompleteReports;}
    if(pressure){pressureMin=pressureMin?std::min(*pressureMin,*pressure):*pressure;pressureMax=pressureMax?std::max(*pressureMax,*pressure):*pressure;}
    if(contact){if(!d.contact||*d.contact!=*contact){if(*contact)++downs;else if(d.contact)++ups;}d.contact=contact;}
    if(logged++<10000){events<<"{\"elapsedMs\":"<<GetTickCount64()-started<<",\"device\":"<<reinterpret_cast<uintptr_t>(raw->header.hDevice)<<",\"background\":"<<(background?"true":"false")<<",\"x\":"<<number(x)<<",\"y\":"<<number(y)<<",\"pressure\":"<<number(pressure)<<",\"contact\":"<<(contact?(*contact?"true":"false"):"null")<<",\"inRange\":"<<(range?(*range?"true":"false"):"null")<<",\"reportBytes\":"<<hid.dwSizeHid<<"}\n";}
  }
}
static void writeStatus(){
  std::ofstream file(output/L"status.tmp");
  file<<"{\"elapsedMs\":"<<GetTickCount64()-started<<",\"pid\":"<<GetCurrentProcessId()<<",\"running\":"<<(running?"true":"false")<<",\"rawMessages\":"<<messages<<",\"hidReports\":"<<reports<<",\"penReports\":"<<penReports<<",\"backgroundPenReports\":"<<backgroundPenReports<<",\"xyPressureReports\":"<<completeReports<<",\"backgroundXYPressureReports\":"<<backgroundCompleteReports<<",\"contactDowns\":"<<downs<<",\"contactUps\":"<<ups<<",\"pressureMin\":"<<number(pressureMin)<<",\"pressureMax\":"<<number(pressureMax)<<",\"decodeErrors\":"<<decodeErrors<<",\"registrations\":[";
  bool comma=false;for(const auto& [usage,error]:registrations){if(comma)file<<',';comma=true;file<<"{\"page\":"<<usage.first<<",\"usage\":"<<usage.second<<",\"error\":"<<error<<'}';}
  file<<"],\"devices\":[";comma=false;
  for(const auto& [handle,d]:devices){if(comma)file<<',';comma=true;file<<"{\"handle\":"<<reinterpret_cast<uintptr_t>(handle)<<",\"page\":"<<d.page<<",\"usage\":"<<d.usage<<",\"penCandidate\":"<<(d.pen?"true":"false")<<",\"values\":[";bool vcomma=false;
    for(const auto& v:d.values){if(vcomma)file<<',';vcomma=true;file<<"{\"page\":"<<v.UsagePage<<",\"usageMin\":"<<(v.IsRange?v.Range.UsageMin:v.NotRange.Usage)<<",\"usageMax\":"<<(v.IsRange?v.Range.UsageMax:v.NotRange.Usage)<<",\"reportId\":"<<unsigned(v.ReportID)<<",\"bits\":"<<v.BitSize<<",\"logicalMin\":"<<v.LogicalMin<<",\"logicalMax\":"<<v.LogicalMax<<'}';}file<<"]}";
  }file<<"]}";file.close();MoveFileExW((output/L"status.tmp").c_str(),(output/L"status.json").c_str(),MOVEFILE_REPLACE_EXISTING);events.flush();
}
static LRESULT CALLBACK windowProc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){
  if(msg==WM_INPUT){receive(reinterpret_cast<HRAWINPUT>(lp),wp);return DefWindowProcW(hwnd,msg,wp,lp);}
  if(msg==WM_INPUT_DEVICE_CHANGE){
    const auto handle=reinterpret_cast<HANDLE>(lp);
    if(wp==GIDC_REMOVAL)devices.erase(handle);
    else if(!devices.count(handle)){
      auto d=inspect(handle);const auto usage=std::make_pair(d.page,d.usage);
      if(d.pen&&std::none_of(registrations.begin(),registrations.end(),[&](const auto& r){return r.first==usage;})){RAWINPUTDEVICE r{d.page,d.usage,RIDEV_INPUTSINK|RIDEV_DEVNOTIFY,receiver};BOOL ok=RegisterRawInputDevices(&r,1,sizeof(r));registrations.push_back({usage,ok?0:GetLastError()});}
      devices.emplace(handle,std::move(d));
    }
    writeStatus();return 0;
  }
  if(msg==WM_TIMER){writeStatus();InvalidateRect(hwnd,nullptr,TRUE);if(duration&&(GetTickCount64()-started)/1000>=duration)DestroyWindow(hwnd);return 0;}
  if(msg==WM_PAINT){PAINTSTRUCT p;HDC dc=BeginPaint(hwnd,&p);RECT r{20,20,660,250};std::wstring text=L"请在其他程序中用笔悬空、书写和快速打点。\n本窗口不需要获得焦点。\n\n后台笔报告："+std::to_wstring(backgroundPenReports)+L"\n后台坐标＋压力报告："+std::to_wstring(backgroundCompleteReports)+L"\n落笔 / 抬笔："+std::to_wstring(downs)+L" / "+std::to_wstring(ups)+L"\n\n记录目录："+output.wstring();DrawTextW(dc,text.c_str(),-1,&r,DT_LEFT|DT_WORDBREAK);EndPaint(hwnd,&p);return 0;}
  if(msg==WM_DESTROY){running=false;writeStatus();std::ofstream(output/L"finished.txt")<<"Probe stopped; status.json contains final counters.\n";PostQuitMessage(0);return 0;}
  return DefWindowProcW(hwnd,msg,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int){
  wchar_t executable[MAX_PATH];GetModuleFileNameW(nullptr,executable,MAX_PATH);output=fs::path(executable).parent_path()/L"report";
  int argc=0;LPWSTR* argv=CommandLineToArgvW(GetCommandLineW(),&argc);for(int i=1;i<argc;i++){std::wstring a=argv[i];if(a==L"--stop"){HWND existing=FindWindowW(L"InkspaceRawInputProbe",nullptr);if(existing)PostMessageW(existing,WM_CLOSE,0,0);LocalFree(argv);return 0;}if(a==L"--stream")stream=true;else if(a==L"--show")show=true;else if(a.starts_with(L"--out="))output=a.substr(6);else if(a.starts_with(L"--duration="))duration=std::stoul(a.substr(11));}LocalFree(argv);
  fs::create_directories(output);events.open(output/L"samples.jsonl");started=GetTickCount64();
  WNDCLASSW cls{};cls.lpfnWndProc=windowProc;cls.hInstance=instance;cls.lpszClassName=L"InkspaceRawInputProbe";cls.hCursor=LoadCursorW(nullptr,IDC_ARROW);cls.hbrBackground=HBRUSH(COLOR_WINDOW+1);RegisterClassW(&cls);
  receiver=CreateWindowExW(0,cls.lpszClassName,L"Inkspace · Raw Input 验证",WS_OVERLAPPEDWINDOW,CW_USEDEFAULT,CW_USEDEFAULT,700,330,nullptr,nullptr,instance,nullptr);if(!receiver)return 1;
  inventory();registerDevices();writeStatus();SetTimer(receiver,1,1000,nullptr);if(show)ShowWindow(receiver,SW_SHOWNOACTIVATE);
  MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}return 0;
}
