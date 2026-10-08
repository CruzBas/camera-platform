namespace CameraPlatform.Application.Cameras;

public static class SourceUrls
{
    /// <summary>rtsp://admin:secreto@10.0.0.5:554/11 → rtsp://admin:***@10.0.0.5:554/11</summary>
    public static string Mask(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return "***";
        var user = uri.UserInfo.Split(':', 2)[0];
        var userInfo = uri.UserInfo.Length == 0 ? "" : $"{user}:***@";
        return $"{uri.Scheme}://{userInfo}{uri.Authority}{uri.PathAndQuery}";
    }
}
