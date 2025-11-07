package controller

import (
    "net/http"
    "strings"

    "github.com/gin-gonic/gin"
    "network-panel/golang-backend/internal/app/response"
    appver "network-panel/golang-backend/internal/app/version"
)

// GET /api/v1/version
func Version(c *gin.Context) {
    // Backend version
    serverVer := appver.Get() // e.g. "1.0.1"
    base := serverVer
    // tolerate legacy values like "server-1.0.1"
    if strings.HasPrefix(base, "server-") {
        base = strings.TrimPrefix(base, "server-")
    }
    // Expected agent versions strictly follow backend version
    agentVer := "go-agent-" + base
    agent2Ver := "go-agent2-" + base
    c.JSON(http.StatusOK, response.Ok(map[string]string{
        "server": serverVer,
        "agent":  agentVer,
        "agent2": agent2Ver,
    }))
}
