// Windows high-resolution pen input and Xournal++/Cairo ink backend.
// GNU GPL v2 or later; see LICENSE and UPSTREAM.md.
#define WINVER 0x0A00
#define _WIN32_WINNT 0x0A00
#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <deque>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>
#include "napi-dynamic.h"
#include "xournal-contour.h"

static napi_value undef(napi_env e){napi_value v;napi_get_undefined(e,&v);return v;}
static napi_value num(napi_env e,double n){napi_value v;napi_create_double(e,n,&v);return v;}
static napi_value str(napi_env e,const std::string& s){napi_value v;napi_create_string_utf8(e,s.c_str(),s.size(),&v);return v;}
static void prop(napi_env e,napi_value o,const char* k,napi_value v){napi_set_named_property(e,o,k,v);}
static napi_value field(napi_env e,napi_value o,const char* k){napi_value v;if(napi_get_named_property(e,o,k,&v)!=napi_ok)throw std::runtime_error(k);return v;}
static double number(napi_env e,napi_value o,const char* k){double n;if(napi_get_value_double(e,field(e,o,k),&n)!=napi_ok||!std::isfinite(n))throw std::runtime_error(k);return n;}
static napi_value argument(napi_env e,napi_callback_info info){size_t n=1;napi_value v;if(napi_get_cb_info(e,info,&n,&v,nullptr,nullptr)!=napi_ok||n!=1)throw std::runtime_error("Expected one argument");return v;}
static std::vector<Point> points(napi_env e,napi_value o){
  napi_typedarray_type type;size_t length,offset;void* data;napi_value buffer;
  if(napi_get_typedarray_info(e,field(e,o,"points"),&type,&length,&data,&buffer,&offset)!=napi_ok||type!=napi_float64_array||length%3||length>3000000)throw std::runtime_error("Expected x/y/pressure Float64Array");
  double width=number(e,o,"width");if(width<=0||width>100)throw std::runtime_error("Invalid pen width");
  bool pressure=true;napi_get_value_bool(e,field(e,o,"hasPressure"),&pressure);
  auto a=static_cast<const double*>(data);std::vector<Point> out;out.reserve(length/3);
  for(size_t i=0;i<length;i+=3){
    if(!std::isfinite(a[i])||!std::isfinite(a[i+1])||!std::isfinite(a[i+2])||a[i+2]<0||a[i+2]>1)throw std::runtime_error("Invalid pen sample");
    Point q{a[i],a[i+1],width*(pressure?std::max(.001,a[i+2]):1)};
    if(!out.empty()&&q.x==out.back().x&&q.y==out.back().y){out.back().z=std::max(out.back().z,q.z);continue;}
    // Xournal++ limits each width transition to 0.3 world units. Keep raw
    // samples in the document; these interpolants belong only to geometry.
    if(!out.empty()){
      const Point a=out.back();int steps=std::min(256,std::max(1,static_cast<int>(std::ceil(std::abs(q.z-a.z)/.3))));
      for(int j=1;j<steps;j++){double t=double(j)/steps;out.push_back({a.x+(q.x-a.x)*t,a.y+(q.y-a.y)*t,a.z+(q.z-a.z)*t});}
    }
    out.push_back(q);
  }
  return out;
}
static void outline(cairo_t* cr,const std::vector<Point>& ps){
  if(ps.empty())return;
  if(ps.size()==1)cairo_arc(cr,ps[0].x,ps[0].y,ps[0].z*.5,0,2*M_PI);
  else xoj::view::StrokeContour(ps).addToCairo(cr);
}
static napi_value raster(napi_env e,napi_callback_info info){
  try{
    auto o=argument(e,info);auto ps=points(e,o);
    double wd=number(e,o,"pixelWidth"),hd=number(e,o,"pixelHeight"),scale=number(e,o,"scale"),tx=number(e,o,"tx"),ty=number(e,o,"ty");
    if(wd<1||hd<1||wd>8192||hd>8192||wd*hd>16777216||std::floor(wd)!=wd||std::floor(hd)!=hd||scale<=0)throw std::runtime_error("Invalid raster bounds");
    int w=int(wd),h=int(hd);uint32_t color=uint32_t(number(e,o,"color"));
    cairo_surface_t* surface=cairo_image_surface_create(CAIRO_FORMAT_ARGB32,w,h);cairo_t* cr=cairo_create(surface);
    cairo_set_antialias(cr,CAIRO_ANTIALIAS_BEST);cairo_matrix_t m{scale,0,0,scale,tx,ty};cairo_set_matrix(cr,&m);
    cairo_set_source_rgb(cr,((color>>16)&255)/255.,((color>>8)&255)/255.,(color&255)/255.);
    outline(cr,ps);cairo_fill(cr);auto status=cairo_status(cr);cairo_destroy(cr);cairo_surface_flush(surface);
    if(status!=CAIRO_STATUS_SUCCESS){cairo_surface_destroy(surface);throw std::runtime_error(cairo_status_to_string(status));}
    const auto* src=cairo_image_surface_get_data(surface);int stride=cairo_image_surface_get_stride(surface);std::vector<uint8_t> rgba(size_t(w)*h*4);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
      auto s=src+y*stride+x*4;auto d=rgba.data()+(size_t(y)*w+x)*4;unsigned a=s[3];
      d[0]=a?std::min(255u,(s[2]*255u+a/2)/a):0;d[1]=a?std::min(255u,(s[1]*255u+a/2)/a):0;d[2]=a?std::min(255u,(s[0]*255u+a/2)/a):0;d[3]=a;
    }
    cairo_surface_destroy(surface);napi_value result;napi_create_buffer_copy(e,rgba.size(),rgba.data(),nullptr,&result);return result;
  }catch(const std::exception& ex){napi_throw_error(e,nullptr,ex.what());return undef(e);}
}
static napi_value path(napi_env e,napi_callback_info info){
  try{
    auto ps=points(e,argument(e,info));auto surface=cairo_recording_surface_create(CAIRO_CONTENT_ALPHA,nullptr);auto cr=cairo_create(surface);outline(cr,ps);
    auto p=cairo_copy_path(cr);std::ostringstream d;d.precision(17);
    for(int i=0;i<p->num_data;){auto* v=&p->data[i];switch(v->header.type){
      case CAIRO_PATH_MOVE_TO:d<<"M "<<v[1].point.x<<' '<<v[1].point.y<<' ';break;
      case CAIRO_PATH_LINE_TO:d<<"L "<<v[1].point.x<<' '<<v[1].point.y<<' ';break;
      case CAIRO_PATH_CURVE_TO:d<<"C "<<v[1].point.x<<' '<<v[1].point.y<<' '<<v[2].point.x<<' '<<v[2].point.y<<' '<<v[3].point.x<<' '<<v[3].point.y<<' ';break;
      case CAIRO_PATH_CLOSE_PATH:d<<"Z ";break;
    }i+=v->header.length;}
    cairo_path_destroy(p);cairo_destroy(cr);cairo_surface_destroy(surface);return str(e,d.str());
  }catch(const std::exception& ex){napi_throw_error(e,nullptr,ex.what());return undef(e);}
}

struct Sample{double x,y,p;uint32_t id,frame,flags;uint64_t tick;bool precise,eraser;};
struct Packet{UINT message;std::vector<Sample> samples;};
static HWND root=nullptr;static std::unordered_set<HWND> hooked;static std::deque<Packet> queue;
static std::unordered_map<uint32_t,uint64_t> lastTick;static std::unordered_set<uint32_t> contacts;
static std::mutex queueMutex;static uint64_t received=0,preciseReceived=0;static constexpr UINT_PTR subclassId=0x494e4b34;
static double mapped(double h,double dl,double dr,double sl,double sr){return sl+(h-dl)*(sr-sl)/(dr-dl);}
static LRESULT CALLBACK windowProc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp,UINT_PTR,DWORD_PTR){
  if(msg==WM_NCDESTROY){RemoveWindowSubclass(hwnd,windowProc,subclassId);hooked.erase(hwnd);}
  if(msg==WM_POINTERDOWN||msg==WM_POINTERUPDATE||msg==WM_POINTERUP){
    UINT32 id=GET_POINTERID_WPARAM(wp);POINTER_PEN_INFO latest{};
    if(GetPointerPenInfo(id,&latest)){
      if(msg==WM_POINTERDOWN)contacts.insert(id);
      if(contacts.count(id)){
        UINT32 count=std::min(4096u,std::max(1u,latest.pointerInfo.historyCount));std::vector<POINTER_PEN_INFO> history(count);
        if(!GetPointerPenInfoHistory(id,&count,history.data())){history={latest};count=1;}
        count=std::min(count,UINT32(history.size()));Packet packet{msg,{}};POINT origin{0,0};ClientToScreen(root,&origin);
        RECT device{},display{};bool precise=GetPointerDeviceRects(latest.pointerInfo.sourceDevice,&device,&display)&&device.right!=device.left&&device.bottom!=device.top;
        for(size_t i=count;i>0;i--){const auto& pen=history[i-1];const auto& pi=pen.pointerInfo;
          if(msg==WM_POINTERUPDATE&&!(pi.pointerFlags&POINTER_FLAG_INCONTACT))continue;
          uint64_t tick=pi.PerformanceCount?pi.PerformanceCount:(uint64_t(pi.dwTime)<<32)|pi.frameId;
          if(lastTick.count(id)&&tick<=lastTick[id]&&msg!=WM_POINTERUP)continue;lastTick[id]=tick;
          double x=pi.ptPixelLocationRaw.x,y=pi.ptPixelLocationRaw.y;
          if(precise){x=mapped(pi.ptHimetricLocationRaw.x,device.left,device.right,display.left,display.right);y=mapped(pi.ptHimetricLocationRaw.y,device.top,device.bottom,display.top,display.bottom);}
          packet.samples.push_back({x-origin.x,y-origin.y,(pen.penMask&PEN_MASK_PRESSURE)?pen.pressure/1024.:.5,id,pi.frameId,pi.pointerFlags,tick,precise,bool(pen.penFlags&(PEN_FLAG_ERASER|PEN_FLAG_INVERTED))});
          received++;if(precise)preciseReceived++;
        }
        if(!packet.samples.empty()){std::lock_guard lock(queueMutex);queue.push_back(std::move(packet));}
      }
      if(msg==WM_POINTERUP){contacts.erase(id);lastTick.erase(id);}
    }
  }else if(msg==WM_POINTERCAPTURECHANGED){
    auto id=GET_POINTERID_WPARAM(wp);if(contacts.erase(id)){std::lock_guard lock(queueMutex);queue.push_back({msg,{{0,0,0,id,0,0,0,false,false}}});lastTick.erase(id);}
  }
  return DefSubclassProc(hwnd,msg,wp,lp);
}
static void hook(HWND hwnd){if(!hooked.count(hwnd)&&GetWindowThreadProcessId(hwnd,nullptr)==GetCurrentThreadId()&&SetWindowSubclass(hwnd,windowProc,subclassId,0))hooked.insert(hwnd);}
static BOOL CALLBACK hookChild(HWND hwnd,LPARAM){hook(hwnd);return TRUE;}
static void cleanup(void*){for(auto hwnd:hooked)if(IsWindow(hwnd))RemoveWindowSubclass(hwnd,windowProc,subclassId);hooked.clear();root=nullptr;contacts.clear();lastTick.clear();std::lock_guard lock(queueMutex);queue.clear();}
static napi_value attach(napi_env e,napi_callback_info info){
  try{auto v=argument(e,info);void* data;size_t n;if(napi_get_buffer_info(e,v,&data,&n)!=napi_ok||n!=sizeof(HWND))throw std::runtime_error("Expected window handle");
    HWND hwnd;std::memcpy(&hwnd,data,sizeof(hwnd));if(!IsWindow(hwnd))throw std::runtime_error("Invalid window");
    if(root&&root!=hwnd)cleanup(nullptr);root=hwnd;hook(root);EnumChildWindows(root,hookChild,0);return num(e,hooked.size());
  }catch(const std::exception& ex){napi_throw_error(e,nullptr,ex.what());return undef(e);}
}
static napi_value drain(napi_env e,napi_callback_info){
  std::deque<Packet> packets;{std::lock_guard lock(queueMutex);packets.swap(queue);}napi_value out;napi_create_array_with_length(e,packets.size(),&out);uint32_t k=0;
  for(const auto& packet:packets){napi_value o,ps;napi_create_object(e,&o);napi_create_array_with_length(e,packet.samples.size(),&ps);
    prop(e,o,"type",str(e,packet.message==WM_POINTERDOWN?"pointerdown":packet.message==WM_POINTERUP?"pointerup":packet.message==WM_POINTERCAPTURECHANGED?"pointercancel":"pointermove"));
    for(uint32_t i=0;i<packet.samples.size();i++){const auto& s=packet.samples[i];napi_value q;napi_create_object(e,&q);
      prop(e,q,"x",num(e,s.x));prop(e,q,"y",num(e,s.y));prop(e,q,"p",num(e,s.p));prop(e,q,"id",num(e,s.id));prop(e,q,"frame",num(e,s.frame));prop(e,q,"precise",num(e,s.precise));prop(e,q,"eraser",num(e,s.eraser));napi_set_element(e,ps,i,q);
    }prop(e,o,"samples",ps);napi_set_element(e,out,k++,o);
  }return out;
}
static napi_value status(napi_env e,napi_callback_info){napi_value o;napi_create_object(e,&o);prop(e,o,"cairo",str(e,cairo_version_string()));prop(e,o,"hooks",num(e,hooked.size()));prop(e,o,"samples",num(e,received));prop(e,o,"preciseSamples",num(e,preciseReceived));return o;}
static napi_value calibration(napi_env e,napi_callback_info info){
  try{auto o=argument(e,info);double h=number(e,o,"h"),dl=number(e,o,"deviceStart"),dr=number(e,o,"deviceEnd"),sl=number(e,o,"screenStart"),sr=number(e,o,"screenEnd");if(dr==dl)throw std::runtime_error("Empty device range");return num(e,mapped(h,dl,dr,sl,sr));}catch(const std::exception& ex){napi_throw_error(e,nullptr,ex.what());return undef(e);}
}
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env e,napi_value exports){
  if(!loadNapi())return exports;
  for(const auto& fn:std::initializer_list<std::pair<const char*,napi_callback>>{{"raster",raster},{"path",path},{"attach",attach},{"drain",drain},{"status",status},{"calibration",calibration}}){napi_value f;napi_create_function(e,fn.first,NAPI_AUTO_LENGTH,fn.second,nullptr,&f);prop(e,exports,fn.first,f);}
  napi_add_env_cleanup_hook(e,cleanup,nullptr);return exports;
}
