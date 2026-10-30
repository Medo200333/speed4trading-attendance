// JNI entry for nodejs-mobile: node::Start needs argv in one contiguous buffer.
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <cstdio>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>
#include "node.h"
static int pipes[2];
static void* logger(void*){char buf[1024];ssize_t n;while((n=read(pipes[0],buf,sizeof buf-1))>0){buf[n]=0;__android_log_write(ANDROID_LOG_INFO,"SpeedNode",buf);}return nullptr;}
extern "C" JNIEXPORT jint JNICALL Java_com_zubayd_accesscontrol_NodeRunner_startNode(JNIEnv* env,jclass,jobjectArray args,jobjectArray envs){
  setvbuf(stdout,0,_IOLBF,0);setvbuf(stderr,0,_IONBF,0);pipe(pipes);dup2(pipes[1],1);dup2(pipes[1],2);pthread_t t;pthread_create(&t,0,logger,0);pthread_detach(t);
  jsize ne=env->GetArrayLength(envs);
  for(jsize i=0;i<ne;i++){jstring s=(jstring)env->GetObjectArrayElement(envs,i);const char* c=env->GetStringUTFChars(s,0);std::string kv(c);env->ReleaseStringUTFChars(s,c);size_t eq=kv.find('=');if(eq!=std::string::npos)setenv(kv.substr(0,eq).c_str(),kv.substr(eq+1).c_str(),1);}
  jsize argc=env->GetArrayLength(args);std::vector<std::string> parts;size_t total=0;
  for(jsize i=0;i<argc;i++){jstring s=(jstring)env->GetObjectArrayElement(args,i);const char* c=env->GetStringUTFChars(s,0);parts.emplace_back(c);env->ReleaseStringUTFChars(s,c);total+=parts.back().size()+1;}
  char* block=(char*)calloc(total,1);std::vector<char*> argv;char* p=block;
  for(auto& s:parts){memcpy(p,s.c_str(),s.size());argv.push_back(p);p+=s.size()+1;}
  return node::Start(argc,argv.data());
}
