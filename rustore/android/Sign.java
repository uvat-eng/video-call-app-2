import com.android.apksig.ApkSigner;
import java.io.*; import java.security.*; import java.security.cert.X509Certificate; import java.util.*;
public class Sign {
  public static void main(String[] a) throws Exception {
    char[] pw = System.getenv("KS_PASS").toCharArray();
    KeyStore ks = KeyStore.getInstance("JKS");
    try { ks.load(new FileInputStream(a[0]), pw); } catch (Exception e) { ks = KeyStore.getInstance("PKCS12"); ks.load(new FileInputStream(a[0]), pw); }
    String alias = ks.aliases().nextElement();
    PrivateKey k = (PrivateKey) ks.getKey(alias, pw);
    X509Certificate c = (X509Certificate) ks.getCertificate(alias);
    ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("RUCHAT", k, List.of(c)).build();
    new ApkSigner.Builder(List.of(sc)).setInputApk(new File(a[1])).setOutputApk(new File(a[2]))
      .setMinSdkVersion(26).setV1SigningEnabled(true).setV2SigningEnabled(true).setV3SigningEnabled(true).build().sign();
    System.out.println("signed " + alias);
  }
}
