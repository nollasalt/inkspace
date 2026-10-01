// Windows ConPTY terminal. GPL-2.0-or-later.
#define _WIN32_WINNT 0x0A00
#define NOMINMAX
#include <windows.h>
#include <string>
#include <vector>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <stdexcept>
#include "napi-dynamic.h"
static HPCON consoleHandle=nullptr;
static HANDLE inputWrite=nullptr,outputRead=nullptr,child=nullptr;
static std::thread reader,writer;
static std::mutex outputMutex,inputMutex;
static std::condition_variable inputWake;
static std::deque<std::string> inputQueue;
static std::string output;
static bool stopping=false;
static size_t inputBytes=0;
static napi_value empty(napi_env e){napi_value v;napi_get_undefined(e,&v);return v;}
static napi_value arg(napi_env e,napi_callback_info i){size_t n=1;napi_value v;napi_get_cb_info(e,i,&n,&v,nullptr,nullptr);if(n!=1)throw std::runtime_error("Expected terminal argument");return v;}
static napi_value field(napi_env e,napi_value o,const char* key){napi_value v;napi_get_named_property(e,o,key,&v);return v;}
static int size(napi_env e,napi_value o,const char* key){double v=0;if(napi_get_value_double(e,field(e,o,key),&v)!=napi_ok||v<2||v>1000)throw std::runtime_error("Invalid terminal dimensions");return int(v);}
static std::string bytes(napi_env e,napi_value v){void* data=nullptr;size_t length=0;if(napi_get_buffer_info(e,v,&data,&length)!=napi_ok||length>1024*1024)throw std::runtime_error("Invalid terminal data");return std::string(static_cast<char*>(data),length);}
static std::wstring wide(const std::string& s){if(s.find('\0')!=std::string::npos)throw std::runtime_error("Invalid terminal path");int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),nullptr,0);if(!n)throw std::runtime_error("Invalid UTF-8 path");std::wstring out(n,L'\0');MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),out.data(),n);return out;}
static void closeSession(void*){
 {std::lock_guard<std::mutex> lock(inputMutex);stopping=true;inputQueue.clear();inputBytes=0;}inputWake.notify_all();
 if(consoleHandle){ClosePseudoConsole(consoleHandle);consoleHandle=nullptr;}
 if(writer.joinable())writer.join();
 if(reader.joinable())reader.join();
 if(inputWrite){CloseHandle(inputWrite);inputWrite=nullptr;}if(outputRead){CloseHandle(outputRead);outputRead=nullptr;}if(child){CloseHandle(child);child=nullptr;}
}
static napi_value start(napi_env e,napi_callback_info info){
 try{
  auto o=arg(e,info);auto command=wide(bytes(e,field(e,o,"command"))),cwd=wide(bytes(e,field(e,o,"cwd")));auto envBytes=bytes(e,field(e,o,"environment"));if(envBytes.size()<4||envBytes.size()%2||envBytes.substr(envBytes.size()-4)!=std::string(4,'\0'))throw std::runtime_error("Invalid terminal environment");std::vector<wchar_t> environment(envBytes.size()/2);memcpy(environment.data(),envBytes.data(),envBytes.size());COORD dimensions{short(size(e,o,"cols")),short(size(e,o,"rows"))};closeSession(nullptr);
  HANDLE inputRead=nullptr,outputWrite=nullptr;
  if(!CreatePipe(&inputRead,&inputWrite,nullptr,65536)||!CreatePipe(&outputRead,&outputWrite,nullptr,65536))throw std::runtime_error("Terminal pipe creation failed");
  HRESULT hr=CreatePseudoConsole(dimensions,inputRead,outputWrite,0,&consoleHandle);
  if(FAILED(hr)){CloseHandle(inputRead);CloseHandle(outputWrite);throw std::runtime_error("Windows ConPTY creation failed");}
  {std::lock_guard<std::mutex> lock(outputMutex);output.clear();}
  reader=std::thread([]{char buffer[16384];DWORD length;while(ReadFile(outputRead,buffer,sizeof(buffer),&length,nullptr)&&length){std::lock_guard<std::mutex> lock(outputMutex);output.append(buffer,length);if(output.size()>8*1024*1024)output.erase(0,output.size()-8*1024*1024);}});
  STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;SIZE_T length=0;InitializeProcThreadAttributeList(nullptr,1,0,&length);std::vector<unsigned char> storage(length);startup.lpAttributeList=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  bool initialized=InitializeProcThreadAttributeList(startup.lpAttributeList,1,0,&length);
  bool attached=initialized&&UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,consoleHandle,sizeof(consoleHandle),nullptr,nullptr);
  PROCESS_INFORMATION process{};std::vector<wchar_t> mutableCommand(command.begin(),command.end());mutableCommand.push_back(0);
  bool launched=attached&&CreateProcessW(nullptr,mutableCommand.data(),nullptr,nullptr,FALSE,EXTENDED_STARTUPINFO_PRESENT|CREATE_UNICODE_ENVIRONMENT,environment.data(),cwd.c_str(),&startup.StartupInfo,&process);
  if(initialized)DeleteProcThreadAttributeList(startup.lpAttributeList);CloseHandle(inputRead);CloseHandle(outputWrite);
  if(!launched)throw std::runtime_error("PowerShell process creation failed");child=process.hProcess;CloseHandle(process.hThread);
  {std::lock_guard<std::mutex> lock(inputMutex);stopping=false;}
  writer=std::thread([]{for(;;){std::string data;{std::unique_lock<std::mutex> lock(inputMutex);inputWake.wait(lock,[]{return stopping||!inputQueue.empty();});if(stopping)return;data=std::move(inputQueue.front());inputQueue.pop_front();inputBytes-=data.size();}DWORD written=0;size_t offset=0;while(offset<data.size()){if(!WriteFile(inputWrite,data.data()+offset,DWORD(data.size()-offset),&written,nullptr)||!written)return;offset+=written;}}});
  napi_value result;napi_create_uint32(e,process.dwProcessId,&result);return result;
 }catch(const std::exception& error){closeSession(nullptr);napi_throw_error(e,nullptr,error.what());return empty(e);}
}
static napi_value write(napi_env e,napi_callback_info info){try{auto data=bytes(e,arg(e,info));{std::lock_guard<std::mutex> lock(inputMutex);if(stopping||!child)throw std::runtime_error("Terminal is closed");if(inputBytes+data.size()>1024*1024)throw std::runtime_error("Terminal input queue is full");inputBytes+=data.size();inputQueue.push_back(std::move(data));}inputWake.notify_one();}catch(const std::exception& error){napi_throw_error(e,nullptr,error.what());}return empty(e);}
static napi_value read(napi_env e,napi_callback_info){std::string data;{std::lock_guard<std::mutex> lock(outputMutex);data.swap(output);}napi_value result;napi_create_buffer_copy(e,data.size(),data.data(),nullptr,&result);return result;}
static napi_value resize(napi_env e,napi_callback_info info){try{auto o=arg(e,info);if(consoleHandle)ResizePseudoConsole(consoleHandle,{short(size(e,o,"cols")),short(size(e,o,"rows"))});}catch(const std::exception& error){napi_throw_error(e,nullptr,error.what());}return empty(e);}
static napi_value status(napi_env e,napi_callback_info){DWORD code=0;napi_value v;napi_create_object(e,&v);napi_value exit;napi_create_double(e,child&&GetExitCodeProcess(child,&code)&&code==STILL_ACTIVE?-1.0:double(code),&exit);napi_set_named_property(e,v,"exitCode",exit);return v;}
static napi_value close(napi_env e,napi_callback_info){closeSession(nullptr);return empty(e);}
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env e,napi_value exports){if(!loadNapi())return exports;for(auto pair:{std::pair<const char*,napi_callback>{"start",start},{"write",write},{"read",read},{"resize",resize},{"status",status},{"close",close}}){napi_value fn;napi_create_function(e,pair.first,NAPI_AUTO_LENGTH,pair.second,nullptr,&fn);napi_set_named_property(e,exports,pair.first,fn);}napi_add_env_cleanup_hook(e,closeSession,nullptr);return exports;}
