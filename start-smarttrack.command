#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "==================================================="
echo "  SmartTrack - Offline Pharmacy Management System"
echo "==================================================="

# 1. Check if XAMPP is available
if [ -f "/Applications/XAMPP/xamppfiles/xampp" ]; then
    echo "Verifying local database services..."
    /Applications/XAMPP/xamppfiles/bin/mysqladmin -u root ping &>/dev/null || /Applications/XAMPP/xamppfiles/xampp startmysql &>/dev/null
fi

# 2. Launch SmartTrack
if [ -d "dist" ]; then
    open "http://localhost/SmartTrack/" 2>/dev/null || open "http://localhost:5173/"
else
    open "http://localhost:5173/"
fi

exit 0

