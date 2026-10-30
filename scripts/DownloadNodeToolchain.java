import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.regex.*;
import javax.net.ssl.SSLParameters;
public class DownloadNodeToolchain {
 public static void main(String[] args)throws Exception{
  Path out=Path.of(args[0]);Files.createDirectories(out);String base="https://nodejs.org/dist/latest-v22.x/";
  SSLParameters tls=new SSLParameters(new String[]{"TLS_CHACHA20_POLY1305_SHA256"});tls.setProtocols(new String[]{"TLSv1.3"});
  HttpClient client=HttpClient.newBuilder().sslParameters(tls).followRedirects(HttpClient.Redirect.NORMAL).build();
  HttpResponse<String> list=client.send(HttpRequest.newBuilder(URI.create(base+"SHASUMS256.txt")).GET().build(),HttpResponse.BodyHandlers.ofString());
  if(list.statusCode()!=200)throw new Exception("CHECKSUM_DOWNLOAD_FAILED");
  Matcher m=Pattern.compile("(?m)^([a-f0-9]{64})\\s+(node-v22\\.[0-9]+\\.[0-9]+-win-x64\\.zip)$").matcher(list.body());if(!m.find())throw new Exception("NODE_DISTRIBUTION_NOT_FOUND");
  String expected=m.group(1),name=m.group(2);Path file=out.resolve(name);
  HttpResponse<Path> download=client.send(HttpRequest.newBuilder(URI.create(base+name)).GET().build(),HttpResponse.BodyHandlers.ofFile(file));if(download.statusCode()!=200)throw new Exception("NODE_DOWNLOAD_FAILED");
  byte[] digest=MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file));StringBuilder value=new StringBuilder();for(byte b:digest)value.append(String.format("%02x",b));if(!value.toString().equals(expected))throw new Exception("NODE_INTEGRITY_FAILED");
  Files.writeString(out.resolve("verified-node.json"),"{\"archive\":\""+name+"\",\"sha256\":\""+expected+"\",\"httpsVerified\":true}");System.out.println(name+" SHA256 VERIFIED");
 }
}
